# Coin Card Business Operations V1

**Status:** Ratified and closed  
**Governing documents:**
- `COIN_CARD_ENTITLEMENT_SPECIFICATION_V1.md` at `b3bdc08` (ratified)
- `COIN_CARD_DATA_MODEL_V1.md` at `193dcfa` (ratified and closed)
- `COIN_CARD_CUSTOMER_WORKFLOWS_V1.md` at `39ecd95` (ratified and closed)

**Issued:** 2026-08-02  
**Ratified:** 2026-08-02

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
signing-key distrust, deadline extension, application decline) must create an
administration evidence record before the action takes effect. The evidence
record is canonicalized using `coin-card-canonical-json.v1` and its
domain-separated SHA-256 hash is stored in the lifecycle registry record
referencing that action (see Canonicalization Contract §Administration
Evidence Hash).

Administration evidence fields follow the canonical schema (Canonicalization
Contract §Administration Evidence Action Schema):
`evidenceSchemaVersion`, `action`, `cardId`, `manifestId`, `environment`,
`requestedAt`, `effectiveFrom`, `reasonCode`, `authorityId`, `nonce`.

### Append-only history

Records and lifecycle events are append-only. No historical entry may be
modified or deleted by any operator. Correction of an erroneous record
requires a compensating operation with its own administration evidence.

### Card status is derived

`CoinCard` has no stored `status` field. Card status is derived from the
active entitlement, open `SuspensionCase`, and the presence of a `revocation`
publication. No operator action may write a stored `card.status`. References
to card status in this document always mean the derived status.

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

EvidencePublication stage field: `publication_stage`.
Stages: `PREPARED → SIGNED → PUBLISHED → ACTIVATED`.

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
| Create PaymentRefund automatically (authorized AUP decline, SLA breach, or predicate race) | ✓ | — | — | — | — |
| Cancel existing `pending_activation` Entitlement automatically after PaymentRefund creation (authorized AUP decline, SLA breach, or predicate race) | ✓ | — | — | — | — |
| Create PaymentRefund manually (authorized post-payment AUP decline) | — | — | ✓ | ✓ | — |
| Cancel existing `pending_activation` Entitlement manually after PaymentRefund creation (authorized post-payment AUP decline) | — | — | ✓ | ✓ | — |
| Create PaymentRefund manually (customer provisioning failure) | — | ✓ | — | — | — |
| Cancel existing `pending_activation` Entitlement manually after PaymentRefund creation (customer provisioning failure) | — | ✓ | — | — | — |
| Submit PaymentRefund to provider automatically | ✓ | — | — | — | — |
| Process provider PaymentRefund events and write `refund_confirmed` on success | ✓ | — | — | — | — |
| Reconcile pending, failed, or contradictory PaymentRefund outcomes (AUTO alert, OPR review, FDR escalation) | ✓ | ✓ | — | ✓ | — |
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
| Pre-payment eligibility or AUP decline | `PSO` |
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
   - **Renewal:** handle must already be owned by this customer with derived
     status `ACTIVE` or `EXPIRED` (within grace period).
   - **Post-grace reactivation:** handle must be permanently reserved for
     this customer (`card` record exists with this customer as owner, derived
     status `EXPIRED`, and `NOW() > ent.grace_period_ends_at`).

3. Validate product scope:
   - One active card per customer during the V1 pilot.
   - A customer with an `active` entitlement may not open a second initial
     activation for any other handle.
   - Renewal and reactivation are scoped to the customer's own card.

4. Perform eligibility and acceptable-use screening (`[aud]` if a decision
   record is created):
   - Review occurs before payment whenever reasonably possible. In the pilot,
     "reasonably possible" means: at the time the purchase request is received
     and before the checkout flow presents payment collection to the customer.
   - For post-grace reactivation, the review also considers the card's prior
     suspension or revocation history (Entitlement Specification §8).
   - Decisions use the reason codes defined in §GD-1 (see Governance decisions).
   - If the review concludes the request should be declined:
     - No payment is collected.
     - No entitlement is created.
     - `[aud]` Administration evidence created with
       `action = APPLICATION_DECLINED`, `reasonCode` (from §GD-1),
       `authorityId`, `nonce`, `decline_phase = 'pre_payment'`,
       `acct_id` if one exists, `card_id` if one already exists,
       `evidence_references`, `customer_notice_timestamp`.
     - The customer is notified that the application was not accepted. The
       notice states the reason at the level of detail the operator is
       authorized to disclose; internal detection methods are not exposed.
     - The high-level customer-facing decline categories must be disclosed in
       purchase terms before pilot launch (Entitlement Specification §8).
     - AUP or eligibility decline authority: `PSO` or `FDR`.
     - A pilot-capacity or product-fit decision must never later be
       represented as customer misconduct.
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
   - **stripe_usd:** payment confirmed when Stripe reports
     `payment_intent.succeeded` (or equivalent settled status) and funds are
     not in dispute. `[evt]` `payment_confirmed`.
   - **polygon_usdc:** payment confirmed only after all of the following
     conditions are simultaneously true:
     1. `network_chain_id` is Polygon mainnet `137`.
     2. Transaction receipt exists for `network_tx_hash`.
     3. Receipt status indicates success.
     4. The expected native-USDC token contract emitted the expected transfer
        event (sender, recipient, and `amount_atomic` match the pending purchase).
     5. `network_tx_hash` has not previously been consumed for another `pay`
        record.
     6. The transaction's block number is less than or equal to the block
        number returned by `eth_getBlockByNumber('finalized')` on the
        configured RPC provider.
     7. If the configured RPC does not support the `finalized` tag, the payment
        remains `pending` and the fallback provider is queried. Payments must
        not be provisionally confirmed absent `finalized` support.
     8. If providers disagree about the transaction, receipt, or finalized
        height, the payment remains `pending` and is escalated for
        reconciliation. It must not be treated as confirmed.
     - The `polygon_usdc` payment rail must remain disabled until the finality
       check, transfer verification, and transaction-consumption protection
       described above have passed integration testing on Amoy and
       mainnet-compatible reads.
     - `pay.confirmed_at` is set at confirmation, not at submission.
       `[evt]` `payment_confirmed`.
   - `[sla]` Set provisioning deadline: `pay.confirmed_at + 24h`.

10. On payment failure:
    - `pay.status → 'failed'`, `pay.failed_at` set.
    - Handle reservation released.
    - No entitlement created.
    - Customer notified of payment failure.
    - No `LifecycleEvent` is written for payment failure; the `Payment` record
      status is the authoritative record.

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
       while card is still `EXPIRED`).

    e. Repeat acceptable-use review when new information has arrived since
       Phase 1 (new report, prior undisclosed suspension history, or Phase 1
       was deferred). "New information" means a material signal not available
       or considered at Phase 1.

13. If any Phase 3 re-verification fails due to an operator decision to decline:

    * Write `[aud]` Administration evidence with `action = APPLICATION_DECLINED`,
      `reasonCode` from §GD-1, `authorityId`, `nonce`,
      `decline_phase = 'post_payment'`, and the confirmed `payment_id`.
    * Initiate the required full refund by creating one canonical PaymentRefund:

      * `PaymentRefund.payment_id` references the confirmed Payment.
      * `PaymentRefund.amount_atomic = Payment.amount_atomic`.
      * `PaymentRefund.reason_code = 'operator_initiated'`.
      * `PaymentRefund.initiated_by = 'system'` when the authorized automatic
        process creates the record; otherwise it is the actual authorized
        operator ID.
      * Creating the PaymentRefund does not change `Payment.status` to
        `refunded`.
    * Write `[evt]` `refund_initiated` with `payment_id`,
      `payment_refund_id`, and `refund_reason = 'operator_initiated'`.
    * If an existing Entitlement is in `pending_activation`:

      * Transition that Entitlement to `cancelled`.
      * Write `[evt]` `entitlement_cancelled` with
        `cancellation_reason = 'post_payment_operator_decline'` and
        `payment_refund_id` equal to the PaymentRefund created above.
    * If no Entitlement exists, do not create a placeholder Entitlement and do
      not write `entitlement_cancelled`.
    * Notify the customer that the purchase was declined and a full refund was
      initiated; provider confirmation remains pending under the normal refund
      lifecycle.
    * Distinguish the operator-decline ground from customer-caused provisioning
      failure in the audit record. These are not the same event.
    * Do not write `refund_confirmed` in this step. That event is written later
      only when the provider confirms the refund.

14. If Phase 3 re-verification passes, proceed to Phase 4.

#### Phase 4 — Provisioning

15. Account existence or creation:
    - If no `acct` exists for this customer, create it with `status = active`.
    - If `acct` exists, verify it is not closed or suspended.

16. Card identity:
    - **Initial activation:** create `card` record with `handle`, `card_id`,
      `public_url`, `owner_customer_id`. Card status is derived; no stored
      status field.
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
    - Create 8 separate `AccountRecoveryCode` records; store the bcrypt-hashed
      value in each record. Do not store hashes on the `Account` record.
    - Plain-text codes are delivered to the customer exactly once after
      activation (see step 26). They are not stored in plain text anywhere.
    - Operators may not view or regenerate recovery codes. `CST` only.

20. Canonical artifact assembly:
    - Assemble the card payload in `coin-card-canonical-json.v1` format
      (Canonicalization Contract §Canonical JSON):
      - UTF-8, no insignificant whitespace, keys sorted by Unicode code point,
        NFC-normalized strings.
    - Compute domain-separated SHA-256 payload hash
      (Canonicalization Contract §Payload Hash Vector).
    - EvidencePublication created: `pub.publication_stage = PREPARED`.

21. Signing:
    - Resolve the active `coin-card-registry-publication` signing key
      (`TRUSTED_KEY_ACTIVE` status required; import failure fails closed).
    - Sign the canonical lifecycle registry record per the lifecycle record
      signature schema (Canonicalization Contract §Lifecycle Record Signature
      Schema). IEEE P1363 ECDSA encoding; 86 unpadded base64url characters.
    - `pub.publication_stage → SIGNED`.

22. Publication:
    - Publish signed card package to the registry.
    - Card page becomes accessible at `coincard.click/<handle>`.
    - `pub.publication_stage → PUBLISHED`, `pub.published_at` set.
    - This step must succeed before entitlement activation. If publication
      fails after SIGNED, retry before activating. Do not activate on an
      unpublished package.

23. Atomic entitlement activation (compare-and-swap):
    - In a single atomic transaction:
      a. Read `card.active_entitlement_version` (current value: `v`).
      b. Set `ent.status → active`, `ent.activated_at`, `ent.expires_at`
         (12 calendar months from `ent.activated_at`),
         `ent.grace_period_ends_at` (`ent.expires_at + 30 days`),
         `ent.route_changes_allowed = 4`, `ent.route_changes_used = 0`.
         (`route_changes_remaining` is derived; do not store it.)
      c. Set `card.active_entitlement_id = ent.id`,
         `card.active_entitlement_version = v + 1`.
      d. Write `pub.publication_stage → ACTIVATED`, `pub.activated_at`.
      e. Write `[evt]`:
         - Initial activation: `entitlement_activated`
           with `activated_at`, `expires_at`.
         - Renewal: `entitlement_activated`
           with `activated_at`, `expires_at`, `prior_entitlement_id`.
           Publication type `renewal` distinguishes this from initial activation.
         - Post-grace reactivation: `entitlement_reactivated`
           with `activated_at`, `expires_at`, `prior_entitlement_id`,
           `prior_publication_id`.
      f. If the compare-and-swap fails (another process changed
         `active_entitlement_version` between read and write), abort and
         create a reconciliation case. Do not activate.
    - `[sla]` Provisioning SLA satisfied if
      `pub.published_at ≤ pay.confirmed_at + 24h`.

24. Activation publication fields for reactivation:
    - `pub.publication_type = 'reactivation'`
    - Signing inputs include:
      `reactivation_prior_entitlement_id`, `reactivation_prior_publication_id`,
      `reactivation_effective_at`.
    - See Data Model V1 EvidencePublication table.

25. Customer activation notice:
    - Deliver activation confirmation including:
      - Handle and public URL
      - Activation date and expiration date
      - Route-change allowance (`route_changes_allowed`)
      - Recovery-code delivery (initial activation: one-time plain-text
        delivery with instruction to store securely)
      - Renewal-notice schedule (first notice 30 days before expiration)

#### Phase 5 — SLA monitoring

26. Before 18 hours from `pay.confirmed_at`:
    - `AUTO` checks whether `pub.publication_stage` has reached `PUBLISHED`.
    - If not, alert `OPR` and `PSO`.

27. Before 22 hours from `pay.confirmed_at`:
    - If `pub.publication_stage` has not reached `PUBLISHED`, escalate to `FDR`.
    - Operator must determine whether to obtain the customer's explicit
      agreement to an extension or to initiate an automatic refund.

28. At `pay.confirmed_at + 24h` (SLA deadline):
    - If `pub.publication_stage` has not reached `PUBLISHED` and no valid
      customer-agreed provisioning extension prevents the breach:

      * Write `[evt]` `provisioning_sla_breach` with `provisioning_deadline`
        and `elapsed_seconds`.
      * Create one canonical full-amount PaymentRefund:

        * `PaymentRefund.payment_id` references the confirmed Payment.
        * `PaymentRefund.amount_atomic = Payment.amount_atomic`.
        * `PaymentRefund.reason_code = 'provisioning_sla_breach'`.
        * `PaymentRefund.initiated_by = 'system'`.
        * Creating the PaymentRefund does not change `Payment.status` to
          `refunded`.
      * Write `[evt]` `refund_initiated` with `payment_id`,
        `payment_refund_id`, and `refund_reason = 'provisioning_sla_breach'`.
      * If an existing Entitlement is in `pending_activation`:

        * Transition that Entitlement to `cancelled`.
        * Write `[evt]` `entitlement_cancelled` with
          `cancellation_reason = 'provisioning_sla_breach'` and
          `payment_refund_id` equal to the PaymentRefund created above.
      * If no Entitlement exists, do not create a placeholder Entitlement and
        do not write `entitlement_cancelled`.
      * No residual obligation to provision remains after this operation.
      * Do not write `refund_confirmed` in this step. That event is written
        later only when the provider confirms the refund.
      * Escalate to `FDR` immediately.
      * Notify the customer that the provisioning deadline was missed, a full
        refund was initiated automatically, and provider confirmation remains
        pending under the normal refund lifecycle. The customer is not required
        to request the refund.

---

### Records created or mutated

| Record | When | Fields set |
|---|---|---|
| `pay` | Phase 2 | `status`, `payment_rail`, `payment_asset`, `amount_atomic`, `asset_decimals`, `provider_payment_id`, `network_chain_id`, `network_tx_hash`, `created_at`, `confirmed_at` or `failed_at` |
| `acct` | Phase 4 | Created or verified |
| `card` | Phase 4 | Created (initial): `handle`, `card_id`, `public_url`, `owner_customer_id`. Mutated (all): `active_entitlement_id`, `active_entitlement_version`. No stored `status` field. |
| `AccountRecoveryCode` × 8 | Phase 4, initial activation only | Bcrypt hash; linked to `acct`; `used_at` null |
| `route` | Phase 4 | Created |
| `ent` | Phase 4 | Created; `status → pending_activation → active`; `activated_at`, `expires_at`, `grace_period_ends_at`, `route_changes_allowed = 4`, `route_changes_used = 0` |
| `pub` | Phase 4 | `publication_stage: PREPARED → SIGNED → PUBLISHED → ACTIVATED`; all stage timestamps |

### Lifecycle events written

| Event | Trigger |
|---|---|
| `payment_confirmed` | Step 9 — payment confirmed |
| `entitlement_activated` | Step 23 — initial activation or renewal |
| `entitlement_reactivated` | Step 23 — post-grace reactivation |
| `entitlement_cancelled` | Conditional on an existing `pending_activation` Entitlement actually transitioning to `cancelled`; no placeholder Entitlement is created. Payload carries `cancellation_reason` and non-null `payment_refund_id`. Four BO1 paths: Step 13 (`cancellation_reason = 'post_payment_operator_decline'`); Step 28 / N-1 (`cancellation_reason = 'provisioning_sla_breach'`); R-4 (`cancellation_reason = 'customer_provisioning_failure'`); R-6 / N-3 — losing operation in a handle or compare-and-swap race (`cancellation_reason = 'post_payment_predicate_failure'`) |
| `provisioning_sla_breach` | Step 28 / N-1 — 24-hour deadline missed without a valid customer-agreed extension |
| `refund_initiated` | Written when the canonical PaymentRefund is created, not when the provider confirms success. Four BO1 paths: Step 13 (`PaymentRefund.reason_code = 'operator_initiated'`); Step 28 / N-1 (`PaymentRefund.reason_code = 'provisioning_sla_breach'`); R-4 (`PaymentRefund.reason_code = 'customer_provisioning_failure'`); R-6 / N-3 — losing operation in a handle or compare-and-swap race (`PaymentRefund.reason_code = 'post_payment_predicate_failure'`) |
| `refund_confirmed` | When the provider confirms the refund — asynchronous and independent of Entitlement cancellation |
| `publication_abandoned` | Any publication abandoned after `PREPARED`; internal audit only |

No `LifecycleEvent` is written for payment failure, application decline, or
recovery-code consumption. Payment failure is recorded as `Payment.status`.
Application decline is recorded as administration evidence. Recovery-code
consumption is recorded as `AccountRecoveryCode.used_at`.

### Evidence publications created

| Type | Trigger |
|---|---|
| `initial_activation` | Initial activation |
| `renewal` | Renewal |
| `reactivation` | Post-grace reactivation |

### Customer notices

| Notice | Timing | Required content |
|---|---|---|
| Eligibility or AUP decline (pre-payment) | Phase 1 | Decision and reason at permitted disclosure level |
| Payment failure | Phase 2, step 10 | Failure reason; no charge |
| Post-payment decline | Phase 3, step 13 | Decision, refund initiated, timeline |
| Activation confirmation | Phase 4, step 25 | Handle, URL, dates, route allowance, recovery codes (initial only) |
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
- Any order not at `pub.publication_stage = ACTIVATED` 18 hours after
  `pay.confirmed_at` generates an alert to `OPR` and `PSO`.
- Any order not at `pub.publication_stage = ACTIVATED` 22 hours after
  `pay.confirmed_at` escalates to `FDR`.
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
| Confirmed `pay` with no `ent` record | Create reconciliation case; escalate to `OPR`; do not provision without operator review |
| `ent.status = active` but no corresponding confirmed `pay` | Immediate escalation to `PSO`; treat as integrity failure until explained |
| `pub.publication_stage = PUBLISHED` but no `ACTIVATED` > 2h | Escalate to `OPR`; retry activation or issue compensating publication |
| `card.active_entitlement_id` set but `ent.status ≠ active` | Immediate escalation to `PSO`; pointer mismatch is an integrity failure |
| Refund initiated but no provider confirmation > 24h | Alert `OPR`; follow up with provider; do not re-initiate without confirming non-duplication |
| Two `pay` records sharing `provider_payment_id` or `network_tx_hash` | Immediate escalation; idempotency failure; one record must be marked `duplicate` with explanation |
| `card.active_entitlement_version` gap (non-sequential) | Escalate to `PSO`; audit the gap |

Corrective action must not rewrite historical records. Corrections must be
compensating operations with administration evidence and operator attribution.

### Recoverable exceptions

| Exception | Condition | Response |
|---|---|---|
| R-1: Provisioning failure before deadline | `pub.publication_stage < PUBLISHED` and time < `pay.confirmed_at + 24h` | Retry provisioning; keep order active; alert `OPR` per SLA schedule |
| R-2: Signing unavailable | Signing key not importable or service unavailable | Halt provisioning; alert `OPR`; do not sign with unverified key; retry when key is available |
| R-3: Publication delivery failure | Registry unavailable during PUBLISHED step | Retry publication; do not activate on unconfirmed publication |

**R-4: Customer-caused provisioning failure**

*Condition:* Customer cannot supply a valid recipient address or other valid provisioning prerequisite within the governing provisioning window.

*Response:*

1. Cancel the provisioning operation under the governing Entitlement rules.
2. Create the canonical PaymentRefund required for this paid provisioning failure:

   * `PaymentRefund.payment_id` references the confirmed Payment.
   * `PaymentRefund.amount_atomic = Payment.amount_atomic`.
   * `PaymentRefund.reason_code = 'customer_provisioning_failure'`.
   * `PaymentRefund.initiated_by` is the actual authorized operator ID.
   * Creating the PaymentRefund does not change `Payment.status` to `refunded`.
3. Write `[evt]` `refund_initiated` with `payment_id`, `payment_refund_id`, and
   `refund_reason = 'customer_provisioning_failure'`.
4. If an existing Entitlement is in `pending_activation`:

   * Transition it to `cancelled`.
   * Write `[evt]` `entitlement_cancelled` with
     `cancellation_reason = 'customer_provisioning_failure'` and
     `payment_refund_id` equal to the PaymentRefund created above.
5. If no Entitlement exists, do not create a placeholder Entitlement and do not
   write `entitlement_cancelled`.
6. Do not create a cancellation EvidencePublication for this pending-activation path.
7. Do not write `refund_confirmed` in this path. That event is written later only
   when the provider confirms the refund.
8. Notify the customer that provisioning was cancelled because the required valid
   prerequisite was not completed, a refund was initiated, and provider confirmation
   remains pending under the normal refund lifecycle.
9. No operator penalty applies. This ground is distinct from `customer_request`
   (the customer did not request a refund) and distinct from `provisioning_sla_breach`
   (the SLA deadline did not drive this cancellation).

| Exception | Condition | Response |
|---|---|---|
| R-5: Payment provider webhook delay | Stripe or on-chain confirmation delayed | Wait; do not activate on pending payment; alert if delay exceeds operational threshold |
| R-6: Handle race condition | Handle claimed by another order between reservation and activation | Preserve the authoritative winning handle claim; the losing PurchaseAttempt cannot continue provisioning with that handle; create canonical full-amount PaymentRefund for the losing Payment (`reason_code = 'post_payment_predicate_failure'`, `initiated_by = 'system'`); preserve the handle-race subtype in operational or reconciliation evidence; write `[evt]` `refund_initiated`; if an existing Entitlement for the losing operation is in `pending_activation` transition it to `cancelled` and write `[evt]` `entitlement_cancelled` (`cancellation_reason = 'post_payment_predicate_failure'`, `payment_refund_id` references that PaymentRefund); if no Entitlement exists do not create a placeholder and do not write `entitlement_cancelled`; no Entitlement for the losing operation reaches `active`; no cancellation EvidencePublication; notify losing customer that handle became unavailable and full refund was initiated; route any ambiguous ownership result to reconciliation |

### Non-recoverable exceptions

| Exception | Condition | Response |
|---|---|---|
| N-1: SLA breach without extension agreement | `Payment.confirmed_at + 24h` reached without `pub.publication_stage = PUBLISHED` and no valid customer-agreed extension | Per Step 28: write `[evt]` `provisioning_sla_breach`; create canonical full-amount PaymentRefund (`reason_code = 'provisioning_sla_breach'`, `initiated_by = 'system'`); write `[evt]` `refund_initiated`; if an existing Entitlement is in `pending_activation` transition it to `cancelled` and write `[evt]` `entitlement_cancelled` (`cancellation_reason = 'provisioning_sla_breach'`, `payment_refund_id` references that PaymentRefund); if no Entitlement exists do not create a placeholder and do not write `entitlement_cancelled`; no Entitlement reaches `active`; no cancellation EvidencePublication; no residual obligation to provision; escalate immediately to `FDR`; notify customer that deadline was missed and full refund was initiated automatically |
| N-2: Post-payment eligibility or AUP decline | Operator declines after confirmed payment | Per Step 13: write canonical `APPLICATION_DECLINED` Administration evidence; create canonical full-amount PaymentRefund (`reason_code = 'operator_initiated'`, `initiated_by = 'system'` when the authorized automatic process creates it, otherwise the actual authorized operator ID); write `[evt]` `refund_initiated`; if an existing Entitlement is in `pending_activation` transition it to `cancelled` and write `[evt]` `entitlement_cancelled` (`cancellation_reason = 'post_payment_operator_decline'`, `payment_refund_id` references that PaymentRefund); if no Entitlement exists do not create a placeholder and do not write `entitlement_cancelled`; no Entitlement reaches `active`; no cancellation EvidencePublication; notify customer that purchase was declined and full refund was initiated; this ground is distinct from customer provisioning failure |
| N-3: Compare-and-swap race | Two competing operations attempted the same authoritative activation or handle claim; exactly one may win; no double Entitlement or double authoritative claim is permitted | Resolve the authoritative winner through the governing compare-and-swap and reconciliation evidence; preserve the winning operation and its valid handle claim; the losing paid operation follows R-6: create canonical full-amount PaymentRefund (`reason_code = 'post_payment_predicate_failure'`, `initiated_by = 'system'`), preserve the compare-and-swap or handle-race predicate in operational or reconciliation evidence, write `[evt]` `refund_initiated`; if an existing Entitlement for the losing operation is in `pending_activation` transition it to `cancelled` and write `[evt]` `entitlement_cancelled` (`cancellation_reason = 'post_payment_predicate_failure'`, `payment_refund_id` references that PaymentRefund); if no losing Entitlement exists do not create a placeholder and do not write `entitlement_cancelled`; no losing Entitlement reaches `active`; no cancellation EvidencePublication; no double Entitlement or double handle claim survives; notify losing customer that the conflicting operation could not be completed and full refund was initiated; contradictory evidence routes to reconciliation |
| N-4: Signing-key integrity failure | Trusted key cannot be imported or is distrust-listed | Halt all provisioning; escalate to `FDR`; do not proceed until resolution |

### Audit evidence

Every completed purchase-and-provisioning operation must preserve:

1. Purchase request record with timestamp and operator attribution.
2. Administration evidence for every eligibility or AUP decline (`[aud]`).
3. `pay` record with all payment fields.
4. `ent` record with all lifecycle fields.
5. `pub` record with all `publication_stage` timestamps.
6. `[evt]` for all lifecycle events written.
7. Customer notice delivery records.
8. Any refund initiation and confirmation records.

### Completion conditions

**Successful completion:** `pub.publication_stage = ACTIVATED`,
`ent.status = active`, `card.active_entitlement_id = ent.id`, customer
activation notice delivered, and (for initial activation) recovery codes
delivered exactly once via 8 `AccountRecoveryCode` records.

**Refund completion:** `pay.status = refunded`, `pay.refunded_at` set,
provider refund confirmed, no `ent` in `active` status, customer notified.

### Daily and periodic control checks

| Check | Frequency | Responsible |
|---|---|---|
| Provisioning SLA queue — any order > 18h since `pay.confirmed_at` without `ACTIVATED` | Every 4 hours | `AUTO` → alert `OPR` |
| Pending `pay` records with no confirmation > 24h | Daily | `AUTO` → alert `OPR` |
| `pub.publication_stage = PUBLISHED` without `ACTIVATED` > 2h | Daily | `AUTO` → alert `OPR` |
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
- `card` — `active_entitlement_id`, current publication (derived status only)
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

Card status `SUSPENDED` is derived from an open, unresolved `SuspensionCase`.
There is no stored status field on `CoinCard`. `Entitlement.status` ordinarily
remains `active` during suspension; the card is non-executable because
execution eligibility is derived from the absence of an open suspension case.

8. Suspension initiation:
   - Authority: `PSO` or `FDR`.
   - `[aud]` Administration evidence: `action = SUSPEND_CARD`, `reasonCode`
     (from §GD-1 acceptable-use grounds), `authorityId`, `cardId`,
     `effectiveFrom`, `nonce`.
   - Create `case` record with fields from Data Model V1:
     - `initiated_at` (not `opened_at`)
     - `initiated_by` (operator ID)
     - `reason` (references the reasonCode from administration evidence)
     - `deadline = initiated_at + 7 calendar days`
     - `customer_notice_sent_at` (set after notice delivery)
   - `[pub]` EvidencePublication: `publication_type = 'suspension'`,
     `pub.publication_stage → PREPARED → SIGNED → PUBLISHED → ACTIVATED`.
   - `[evt]` `suspended`: `suspended_at`, `initiated_by`, `reason`.
   - `ent.status` remains `active`. Execution is disabled through the open
     `SuspensionCase`, not through a stored card or entitlement status.
   - Card page shows derived `SUSPENDED` status publicly.
   - **Customer notice:** delivered at the time of suspension; `case.customer_notice_sent_at` set.
     Must include: stated reason at permitted disclosure level; the existence
     of the review process; contact information.

9. Suspension review period:
   - `PSO` or `FDR` collects evidence. All operator notes and evidence
     references are recorded in the `case` record with timestamps and
     `initiated_by` / `resolved_by` attributions.
   - The case must resolve within 7 calendar days of `case.initiated_at`.

10. Suspension deadline extension (if required):
    - A single extension of up to 7 calendar days is permitted.
    - Authority: `PSO` or `FDR`.
    - `[aud]` Administration evidence: `action = EXTEND_SUSPENSION`,
      `reasonCode`, `authorityId`, `cardId`, `nonce`.
    - `case.extension_reason` recorded.
    - `case.extension_deadline = case.deadline + N days` (≤ 7).
    - `case.extension_notice_sent_at` set after notice delivery.
    - `case.status → resolved_extended`.
    - `[evt]` `suspension_extended`: `extended_at`, `new_deadline`,
      `initiated_by`, `extension_reason`.
    - **Customer notice:** reason for extension and new deadline;
      `case.extension_notice_sent_at` set.
    - One extension only. A second extension is not permitted.

11. Suspension deadline breach (14-calendar-day absolute ceiling):
    - If the case is unresolved at `case.extension_deadline`
      (or at `case.deadline` if no extension was granted):
      - `case.deadline_breached_at` set.
      - `case.escalated_at` set.
      - `case.process_failure_code` recorded.
      - `[evt]` `suspension_deadline_breached`: `breached_at`, `case_id`.
      - Escalate immediately to `FDR`.
      - Breach is an operational escalation, not a customer disposition.
        The case remains open until a valid disposition is reached.
    - A suspension that passes 14 calendar days without a recorded resolution
      or documented extension must be escalated and resolved immediately.

12. Suspension case resolution — four valid terminal states:
    - **`resolved_restored`:** review concluded without grounds for action.
      Proceed to Sub-operation 2.4.
    - **`resolved_revoked`:** review confirmed a violation.
      Proceed to Sub-operation 2.5.
    - **`resolved_expired`:** entitlement term ended during suspension.
      `ent.status → expired`. Card derives `EXPIRED` status; non-executable
      by expiration rather than suspension. `[pub]` expiration publication.
      `[evt]` `entitlement_expired`. `case.resolved_at`, `case.resolved_by`,
      `case.resolution_notes`.
    - **`resolved_extended`:** (intermediate, not terminal — see step 10).

---

#### Sub-operation 2.4 — Restoration

13. Restoration preconditions:
    - Review concluded without grounds for action, or underlying integrity
      issue has been resolved.
    - The open `SuspensionCase` must be in an active review state (`open` or
      `resolved_extended`).
    - Verify that `ent.status` is not `expired` or `revoked`. If the
      entitlement expired during suspension, execution is not restored through
      this operation (card derives non-executable status from expiration).

14. Restoration execution:
    - Authority: `PSO` with evidence.
    - `[aud]` Administration evidence: `action = RESTORE_CARD`, `reasonCode`,
      `authorityId`, `cardId`, `effectiveFrom`, `nonce`.
    - `[pub]` EvidencePublication: `publication_type = 'restoration'`,
      `pub.publication_stage → PREPARED → SIGNED → PUBLISHED → ACTIVATED`.
    - `[evt]` `restored`: `restored_at`, `resolved_by`, `resolution_notes`.
    - `ent.status` remains `active` (it was not changed during suspension).
    - `case.status → resolved_restored`. `case.resolved_at`, `case.resolved_by`,
      `case.resolution_notes`.
    - Verify that `card.active_entitlement_id` still points to `ent.id`.
    - Card derives `ACTIVE` status once the case is `resolved_restored` and
      `ent.status = active`. No stored card status is written.
    - Card execution is re-enabled by the resolution of the SuspensionCase.
    - **Customer notice:** restoration confirmed; card is executable;
      reason for original suspension at permitted disclosure level.

---

#### Sub-operation 2.5 — Revocation

15. Revocation preconditions:
    - Confirmed grounds: acceptable-use violation, fraud, court order, or
      other documented grounds per Entitlement Specification §6.
      Use reason codes from §GD-1 acceptable-use grounds.
    - Authority: `FDR` only. Revocation requires final review authority.
    - Evidence basis must be recorded in administration evidence before the
      revocation action.

16. Revocation execution:
    - `[aud]` Administration evidence: `action = REVOKE_CARD`, `reasonCode`,
      `authorityId`, `cardId`, `effectiveFrom`, `nonce`, `evidenceSummaryHash`.
    - `[pub]` EvidencePublication: `publication_type = 'revocation'`,
      `pub.publication_stage → PREPARED → SIGNED → PUBLISHED → ACTIVATED`.
    - `[evt]` `entitlement_revoked`: `revoked_at`, `resolved_by`,
      `grounds_code`.
    - `ent.status → revoked`.
    - Clear `card.active_entitlement_id` (set to null) transactionally with
      the revocation, as the active-entitlement pointer must not refer to a
      revoked entitlement.
    - If a SuspensionCase is open: `case.status → resolved_revoked`,
      `case.resolved_at`, `case.resolved_by`, `case.resolution_notes`.
    - Card derives `REVOKED` status from the `revocation` publication.
      No stored card status is written.
    - Card is permanently non-executable.
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
    - Operators may verify whether a given `AccountRecoveryCode` record has
      been used (by checking `used_at`; not by reading the code value).
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
    - `AccountRecoveryCode.used_at` is set immediately upon session initiation.
      Recovery-code consumption is recorded on the `AccountRecoveryCode` record;
      no Coin Card `LifecycleEvent` is written.
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
      secondary credential, and no unused `AccountRecoveryCode` records,
      account access cannot be restored by operator action.
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
      the card's current derived status; what action (if any) the customer
      should take.

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
| Open SuspensionCases — deadline proximity | Daily | `AUTO` → `PSO` | 24h before `case.deadline` (or `extension_deadline` if set): alert `PSO`; breach: immediate `FDR` |
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
| `case` | Suspension | `initiated_at`, `initiated_by`, `reason`, `deadline`, `customer_notice_sent_at`; `extension_*` fields if extended; `deadline_breached_at`, `escalated_at`, `process_failure_code` if breached; `resolved_at`, `resolved_by`, `resolution_notes` on close |
| `ent` | Revocation | `status → revoked` |
| `pub` | Suspension, restoration, revocation, compensating | `publication_type`, all `publication_stage` timestamps |
| Administration evidence | Every privileged action | Per canonicalization contract |

`ent.status` is NOT mutated during suspension or restoration. Card status is
derived; no `card.status` field is written by any BO2 operation.

### Lifecycle events written

| Event | Sub-operation |
|---|---|
| `suspended` | 2.3 — suspension initiation |
| `suspension_extended` | 2.3 — deadline extension |
| `suspension_deadline_breached` | 2.3 — breach |
| `restored` | 2.4 — restoration |
| `entitlement_revoked` | 2.5 — revocation |
| `entitlement_expired` | 2.3 — expiration during suspension |

Recovery-code consumption is recorded as `AccountRecoveryCode.used_at`; no
Coin Card `LifecycleEvent` is written.

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
| Suspension initial review | 7 calendar days from `case.initiated_at` | Escalate to `FDR`; must resolve |
| Suspension extension | `case.extension_deadline` ≤ `case.deadline + 7 days` | Breach; immediate `FDR` escalation |
| Suspension absolute ceiling | 14 calendar days from `case.initiated_at` | Process failure; immediate `FDR` escalation |
| Signing-key incident response | No fixed window; fail-closed until resolved | Publications halted; affected customers notified |

### Queue and escalation behavior

- All open `SuspensionCase` records are in the operator queue.
- `AUTO` checks case deadlines every 4 hours.
- 24 hours before `case.deadline` (or `case.extension_deadline` if set):
  alert `PSO`.
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
| Open `SuspensionCase` exists for `card_id` | `ent.status = active` for that card; card derives `SUSPENDED` | If `ent.status = revoked` or `expired`, close case with appropriate terminal state |
| `suspension` publication exists | Corresponding open or resolved `case` | Escalate to `PSO`; missing case is integrity failure |
| `case.status = resolved_restored` or `resolved_revoked` | Corresponding terminal `pub` exists | Create compensating publication if missing |
| No open `case` for a card | Card does not derive `SUSPENDED` status | If card is unexpectedly non-executable, escalate to `PSO` |

### Recoverable exceptions

| Exception | Condition | Response |
|---|---|---|
| R-1: Signing unavailable during suspension | Key not importable | Halt suspension publication; containment via execution block; escalate to `FDR` |
| R-2: Customer report with insufficient evidence | Signal received, evidence insufficient for action | Log; monitor; request additional information; no suspension without evidence basis |
| R-3: Case deadline approaching with review incomplete | < 24h to `case.deadline` | Alert `PSO`; accelerate review; extension if genuinely required |

### Non-recoverable exceptions

| Exception | Condition | Response |
|---|---|---|
| N-1: Suspension deadline breach | 14 calendar days without resolution | Immediate `FDR` escalation; process failure |
| N-2: Signing-key exposure confirmed | Key material externally disclosed | Distrust immediately; compensating publications for all affected cards |
| N-3: Evidence chain break | Historical records found modified or deleted | Security incident; `FDR` involvement; forensic preservation |
| N-4: Irrecoverable credential loss | No primary, secondary, or unused `AccountRecoveryCode` records | Cannot restore access by operator action; communicate to customer clearly |

### Audit evidence

Every protection-and-recovery operation must preserve:

1. Incident record with intake classification, operator attribution, timestamp.
2. `[aud]` Administration evidence for every privileged action.
3. `case` record with complete timeline (`initiated_at`, extensions, resolution).
4. All `[pub]` records with `publication_stage` timestamps.
5. All `[evt]` lifecycle events.
6. Customer notice delivery records.
7. Signing-key status records at time of incident and at resolution.

### Completion conditions

**Suspension restored:** `case.status = resolved_restored`, `ent.status = active`,
`case.resolved_at` set, restoration publication `ACTIVATED`, customer notified.
Card derives `ACTIVE` from the resolved case and active entitlement.

**Suspension revoked:** `case.status = resolved_revoked`, `ent.status = revoked`,
`card.active_entitlement_id = null`, revocation publication `ACTIVATED`,
customer notified. Card derives `REVOKED` from the revocation publication.

**Suspension expired:** `case.status = resolved_expired`,
`ent.status = expired`, expiration publication `ACTIVATED`.
Card derives `EXPIRED` from the expired entitlement.

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
- Writing a stored `status` field on `CoinCard` for any purpose.
- Mutating `ent.status` to `suspended` for any reason; suspension is expressed
  through the open `SuspensionCase`, not through the entitlement status.

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
| Initial activation | W2 §2.1–2.6 | `pay`, `ent`, `card`, `route`, `pub`, `AccountRecoveryCode` × 8 | `payment_confirmed`, `entitlement_activated` | `initial_activation` | Activation confirmation | 24h from `pay.confirmed_at` | `AUTO` |
| Renewal | W5 §5.5 | `pay`, `ent`, `pub` | `payment_confirmed`, `entitlement_activated` | `renewal` | Activation confirmation | 24h from `pay.confirmed_at` | `AUTO` |
| Post-grace reactivation | W5 §5.5a | `pay`, `ent`, `card`, `route`, `pub` | `payment_confirmed`, `entitlement_reactivated` | `reactivation` | Activation confirmation | 24h from `pay.confirmed_at` | `AUTO` |
| Pre-payment eligibility or AUP decline | (not in customer workflows; BO1 only) | Administration evidence only | — | — | Decline notice | Before payment collection | `PSO` / `FDR` |
| Post-payment AUP decline + refund | W5 §5.5a | `pay`, Administration evidence, `PaymentRefund` (`reason_code = 'operator_initiated'`), conditional `ent` (no placeholder) | `refund_initiated` (`refund_reason = 'operator_initiated'`); conditional `entitlement_cancelled` (`cancellation_reason = 'post_payment_operator_decline'`; same `payment_refund_id`); later: `refund_confirmed` on provider confirmation | — | Decline + refund notice | Immediate | `PSO` / `FDR` |
| Provisioning SLA breach | (BO1 only) | `pay`, `PaymentRefund` (`reason_code = 'provisioning_sla_breach'`), conditional `ent` (no placeholder) | `provisioning_sla_breach`; `refund_initiated` (`refund_reason = 'provisioning_sla_breach'`); conditional `entitlement_cancelled` (`cancellation_reason = 'provisioning_sla_breach'`; same `payment_refund_id`); later: `refund_confirmed` on provider confirmation | — | Refund initiated | At 24h | `AUTO` + `FDR` escalation |
| Customer provisioning failure | (BO1 only; R-4) | `pay`, `PaymentRefund` (`reason_code = 'customer_provisioning_failure'`), conditional `ent` (no placeholder) | `refund_initiated` (`refund_reason = 'customer_provisioning_failure'`); conditional `entitlement_cancelled` (`cancellation_reason = 'customer_provisioning_failure'`; same `payment_refund_id`); later: `refund_confirmed` on provider confirmation | — | Provisioning cancellation + refund notice | Immediate on failure determination | `OPR` |
| Handle / compare-and-swap predicate failure | (BO1 only; R-6 / N-3) | losing `pay`, `PaymentRefund` (`reason_code = 'post_payment_predicate_failure'`), operational/reconciliation evidence, conditional losing `ent` (no placeholder) | `refund_initiated` (`refund_reason = 'post_payment_predicate_failure'`); conditional `entitlement_cancelled` (`cancellation_reason = 'post_payment_predicate_failure'`; same `payment_refund_id`); later: `refund_confirmed` on provider confirmation | — | Conflict resolution + refund notice to losing customer | Immediate on authoritative race resolution | `AUTO` |
| Suspension | W4 §4.x (operator side) | `case`, `pub` | `suspended` | `suspension` | Suspension notice | 7-day review from `case.initiated_at` | `PSO` |
| Restoration | W4 §4.x (operator side) | `case`, `pub` | `restored` | `restoration` | Restoration notice | At resolution (≤ 14 days) | `PSO` |
| Revocation | W4 §4.x (operator side) | `case`, `ent`, `pub` | `entitlement_revoked` | `revocation` | Revocation notice | At decision | `FDR` |
| Recovery support | W1 §1.4 | `acct`, `AccountRecoveryCode` (read + `used_at`) | — | — | Process communication | None (customer-driven) | `OPR` (communication only) |
| Signing-key incident | (BO2 only) | Key registry, `pub` | — | Compensating pubs | If threshold reached | None fixed; fail-closed | `FDR` |

---

## Governance decisions

All four governance decisions from the initial issue are now resolved.

---

**GD-1 — Pilot eligibility and acceptable-use standard (resolved)**

*Prior state:* AUP criteria undefined; operator discretion unconstrained.

*Resolution:* Two categories of decline are defined. High-level categories
must be disclosed in purchase terms before pilot launch. Internal detection
methods need not be publicly disclosed. An "unlimited operator discretion"
category is not permitted.

### Category 1 — Pilot or product eligibility decline

These are not accusations of misconduct. They decline a request because
ImplicitEx cannot safely or appropriately fulfill it under current conditions.

| Reason code | Meaning |
|---|---|
| `PILOT_CAPACITY` | Pilot capacity is unavailable |
| `UNSUPPORTED_REQUEST` | Request is outside supported V1 product scope |
| `HANDLE_UNAVAILABLE` | Requested handle is unavailable |
| `AUTHORITY_NOT_ESTABLISHED` | Required authority or route information cannot be established |
| `PROVISIONING_NOT_SUPPORTED` | ImplicitEx cannot safely provision the request |

### Category 2 — Acceptable-use decline, suspension, or revocation grounds

These represent affirmative concerns about conduct or intent. A stronger
evidence basis is required than for a Category 1 eligibility decision.

| Reason code | Meaning |
|---|---|
| `IMPERSONATION` | Credible impersonation or deceptive handle use |
| `FRAUD_OR_DECEPTION` | Credible fraud, scam, phishing, or malicious-payment activity |
| `SECURITY_COMPROMISE` | Known credential or card compromise that cannot be safely resolved |
| `LEGAL_PROHIBITION` | Specific documented legal prohibition |
| `PLATFORM_INTEGRITY_ABUSE` | Deliberate interference with platform integrity or signed evidence |
| `MATERIAL_MISREPRESENTATION` | Materially false information supplied to obtain or control a Coin Card |

### Operating rules

- Every decision must cite a reason code, evidence basis, authority ID,
  operator ID, and timestamp.
- A Category 1 decision must never later be represented as customer misconduct.
- Pre-payment eligibility decisions may be made without collecting payment.
- Post-payment operator refusal requires automatic full refund.
- Category 2 suspension or revocation requires a stronger recorded evidence
  basis than a Category 1 eligibility decline.
- High-level customer-facing decline categories must be disclosed in purchase
  terms before pilot launch.
- Internal detection rules, security signals, and investigation methods need
  not be publicly disclosed.

---

**GD-2 — `provisioning_sla_breach` already in Data Model V1 (resolved)**

*Prior state (stale read):* The initial issue incorrectly stated that
`provisioning_sla_breach` was missing from Data Model V1.

*Resolution:* `provisioning_sla_breach` exists in the canonical
`LifecycleEvent` catalog at Data Model V1 `193dcfa`. No data model amendment
is needed. Its canonical payload fields are `provisioning_deadline` and
`elapsed_seconds`. Use these exact field names; do not invent alternatives.

---

**GD-3 — Application declines are administration evidence, not LifecycleEvents (resolved)**

*Prior state:* The initial issue proposed an `application_declined`
LifecycleEvent for both pre- and post-payment declines.

*Resolution:* Application declines are immutable administration evidence.
No Coin Card `LifecycleEvent` named `application_declined` is created.

**Pre-payment decline:** Create administration evidence with:
- `action = APPLICATION_DECLINED`
- `acct_id` if one exists; `card_id` if one already exists
- `decline_phase = 'pre_payment'`
- `reasonCode` (from §GD-1)
- `authorityId`, `operatorId`, decision timestamp
- Evidence references and `customer_notice_timestamp`

No Payment, Entitlement, or Coin Card record is required when none exists
for the request.

**Post-payment decline:** Create the same administration evidence with:
- `decline_phase = 'post_payment'`
- `paymentId` referencing the confirmed Payment

Then execute the canonical refund and cancellation operation (see Step 13 for
the complete sequence):

1. Create the canonical full-amount PaymentRefund:
   - `PaymentRefund.reason_code = 'operator_initiated'`
   - `PaymentRefund.initiated_by = 'system'` when the authorized automatic
     process creates the record; otherwise the actual authorized operator ID
2. Write `[evt]` `refund_initiated` with `payment_id`, `payment_refund_id`,
   and `refund_reason = 'operator_initiated'`.
3. If an existing Entitlement is in `pending_activation`:
   - Transition it to `cancelled`.
   - Write `[evt]` `entitlement_cancelled` with
     `cancellation_reason = 'post_payment_operator_decline'` and
     `payment_refund_id` referencing the same PaymentRefund.
4. If no Entitlement exists, do not create a placeholder Entitlement and do
   not write `entitlement_cancelled`.

**Provider-asynchronous event:** `[evt]` `refund_confirmed` is written later
only when the provider confirms that specific PaymentRefund. It is not a
prerequisite for cancelling an existing `pending_activation` Entitlement or
for writing `entitlement_cancelled`. Provider submission or confirmation is
not required before the Entitlement cancellation operation commits. Do not
list `refund_confirmed` between `refund_initiated` and `entitlement_cancelled`.

---

**GD-4 — Polygon USDC finality via `finalized` tag (resolved)**

*Prior state:* Finality was described as "a block confirmation threshold"
without specifying what that threshold is.

*Resolution:* Do not use a fixed block count. Set `Payment.status = 'confirmed'`
and `pay.confirmed_at` only after all seven conditions in step 9 (polygon_usdc
subsection) are simultaneously true:

1. `network_chain_id` is Polygon mainnet `137`.
2. Transaction receipt exists for `network_tx_hash`.
3. Receipt status indicates success.
4. Expected native-USDC token contract emitted the expected transfer (sender,
   recipient, `amount_atomic` match the pending purchase).
5. `network_tx_hash` has not previously been consumed for another `pay` record.
6. Transaction block number ≤ block number from `eth_getBlockByNumber('finalized')`.
7. Configured RPC supports `finalized` tag; otherwise payment stays `pending`
   and fallback provider is queried.

Provider disagreement leaves the payment `pending` pending reconciliation.
The `polygon_usdc` rail must remain disabled until these checks pass
integration testing on Amoy and mainnet-compatible reads.

---

## Amendment log

### 2026-08-02 — Initial issue

Business Operations V1 issued as governing operator-facing specification.
Two workflows: Purchase and Provisioning (BO1, six sub-operations) and
Protection and Recovery (BO2, eight sub-operations). Four governance decisions
surfaced: GD-1 (AUP criteria), GD-2 (provisioning_sla_breach event),
GD-3 (application_declined event), GD-4 (block confirmation threshold).

### 2026-08-02 — Ratification corrections applied

**Correction 1 — Data-model vocabulary**
Card status is derived and never stored. All references to setting or reading
`card.status` removed. `publication_stage` used as the canonical field name.

**Correction 2 — Suspension state model**
Suspension state corrected: `Entitlement.status` remains `active` during
suspension. Card derives `SUSPENDED` from an open `SuspensionCase`. Canonical
SuspensionCase field names aligned with Data Model V1: `initiated_at`,
`initiated_by`, `deadline`, `extension_deadline`, `extension_reason`,
`extension_notice_sent_at`, `resolved_by`, `resolution_notes`. Canonical
case statuses: `open`, `resolved_extended`, `resolved_restored`,
`resolved_revoked`, `resolved_expired`.

**Correction 3 — Lifecycle-event catalog**
`entitlement_renewed` removed; both initial activation and renewal use
`entitlement_activated` (distinguished by `publication_type`).
`entitlement_suspended` replaced with `suspended`.
`entitlement_restored` replaced with `restored`.
`suspension_extended` and `suspension_deadline_breached` added.
`payment_failed`, `recovery_code_used`, and `application_declined` removed
as LifecycleEvents; their evidence is recorded through Payment record
mutations, AccountRecoveryCode record mutations, and administration evidence
respectively.

**Correction 4 — Recovery-code and route-quota fields**
Recovery codes stored as 8 separate `AccountRecoveryCode` records, not as
hashes on the `Account` record. `route_changes_remaining` removed;
`route_changes_allowed = 4` and `route_changes_used = 0` set at activation.

**Correction 5 — GD-1 AUP standard**
Two-category eligibility and acceptable-use reason-code system defined.
Unlimited operator discretion prohibited. Pre-pilot disclosure requirement set.

**Correction 6 — GD-2 stale-read correction**
`provisioning_sla_breach` confirmed present in Data Model V1. Stale amendment
request removed. Canonical payload fields `provisioning_deadline` and
`elapsed_seconds` adopted.

**Correction 7 — GD-3 administrative-audit resolution**
Application declines are administration evidence, not LifecycleEvents.
Pre- and post-payment decline evidence schema defined. Existing `refund_initiated`,
`refund_confirmed`, and `entitlement_cancelled` events used for post-payment
path.

**Correction 8 — GD-4 finalized-block resolution**
Polygon USDC finality defined via `eth_getBlockByNumber('finalized')` tag with
seven required conditions. Fixed block count approach replaced. `polygon_usdc`
rail gated on Amoy and mainnet-compatible integration testing.

### 2026-08-05 — Refund and cancellation canonicalization (aligned with Data Model f93bc04)

Aligned post-payment refund and `pending_activation` Entitlement-cancellation
operations with Data Model commit `f93bc04 — docs(coin-card): canonicalize
refund and cancellation records`.

**Four BO1 refund paths canonicalized:**

- Post-payment operator/AUP decline (`PaymentRefund.reason_code = 'operator_initiated'`;
  `cancellation_reason = 'post_payment_operator_decline'`)
- Provisioning SLA breach (`reason_code = 'provisioning_sla_breach'`;
  `cancellation_reason = 'provisioning_sla_breach'`)
- Customer provisioning failure (`reason_code = 'customer_provisioning_failure'`;
  `cancellation_reason = 'customer_provisioning_failure'`)
- Handle / compare-and-swap predicate failure (`reason_code = 'post_payment_predicate_failure'`;
  `cancellation_reason = 'post_payment_predicate_failure'`)

**Canonical operation order established for all four paths:**
PaymentRefund creation → `refund_initiated` → conditional `entitlement_cancelled`
→ provider-triggered `refund_confirmed` (later, asynchronous).

**Invariants enforced:**

- `payment_refund_id` must be non-null on all applicable `entitlement_cancelled`
  events; null is valid only when no refund is due.
- No placeholder Entitlement: `entitlement_cancelled` is written only when a
  `pending_activation` Entitlement already exists and transitions.
- No cancellation EvidencePublication for `pending_activation` cancellations.
- Provider confirmation (`refund_confirmed`) is not a prerequisite for
  Entitlement cancellation.
- PaymentRefund creation does not set `Payment.status = 'refunded'`.

**Surfaces corrected or expanded:** Step 13, Step 28, R-4, R-6, N-1, N-2,
N-3, lifecycle-events table, operation crosswalk, GD-3.

**Responsibility matrix refined** to distinguish eight separate concerns:
decision authority; automatic PaymentRefund creation; manual PaymentRefund
creation; automatic Entitlement cancellation; manual Entitlement cancellation;
provider submission; provider-event processing (`refund_confirmed`); and
reconciliation of pending, failed, or contradictory PaymentRefund outcomes.

**Out of scope for this entry:** Customer-requested cancellation of an
already-`active` Entitlement is not a BO1 path and is not amended here.
Stale refund-field references in Customer Workflows V1 (`pay.refund_initiated_at`,
`pay.refund_reason`) are a separate correction and are not resolved in this
amendment.
