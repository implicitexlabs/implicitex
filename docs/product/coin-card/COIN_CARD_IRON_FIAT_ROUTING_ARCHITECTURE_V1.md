# Coin Card Iron Fiat Routing Architecture V1

**Status:** FROZEN — 2026-08-08
**Authority:** Normative architecture for the proposed Iron Virtual Account fiat
receiving rail
**Implementation status:** Not implemented; not approved for production
**Reopen rule:** Reopen this architecture only when provider diligence or empirical
validation produces a concrete security, implementation, or contractual contradiction.

This document freezes the rail's architecture; it does not add the rail to Coin Card's
current commercial offer. Before implementation or customer-facing publication, the
commercial specification must expressly authorize the capability and the resulting
changes must propagate through legal, privacy, engineering, and evidence contracts in
their governing order.

---

## 1. Decision

Coin Card may investigate Iron Virtual Accounts as a provider rail for receiving
third-party USD bank transfers, automatically converting those funds to native USDC
on Polygon, and delivering the USDC to the Coin Card holder's verified wallet.

The intended role assignment is:

```text
Maria
  = Coin Card holder
  = Iron customer / Virtual Account holder
  = controller of the destination wallet

Antoine
  = third-party bank sender
  = source of the USD

Antoine's bank
  → USD by ACH or Wire
  → Maria's Iron Virtual Account
  → Iron conversion
  → native Polygon USDC
  → Maria's verified wallet
```

Coin Card does not receive or custody the USD. Coin Card does not receive or custody
the USDC. Coin Card resolves and publishes a trusted payment route; Iron performs the
regulated fiat receipt, compliance review, conversion, and crypto payout.

This architecture is distinct from ordinary MoonPay Platform Buy. The ordinary Buy
model remains blocked for unrelated recipients unless MoonPay gives written product,
compliance, and contractual approval that eliminates any false purchaser
wallet-ownership representation.

---

## 2. Product boundary

### 2.1 Coin Card identity is permanent; provider routes are replaceable

The Virtual Account is a route beneath a Coin Card identity. It is never the identity.

```text
Coin Card identity
maria.coincard.click
        │
        ├── wallet route v7
        │   Polygon / native USDC / 0xOld...
        │
        └── fiat route v3
            provider: Iron
            USD / ACH + Wire
            autoramp: AR-123
            PBR reference: IR-OLD123
            destination: wallet route v7
```

Iron, its banking partners, account details, deposit rails, and Autoramps may be
replaced without changing the Coin Card identity.

### 2.2 USD Receiving is an optional capability

A base Coin Card verifies wallet control. It does not claim that Coin Card verified
the holder's legal identity.

Activating USD Receiving is an optional provider-backed capability:

```text
Coin Card
✓ wallet route verified

Coin Card + USD Receiving
✓ wallet route verified
✓ Iron customer onboarding complete
✓ Iron receiving rail active
```

Iron owns its KYC/KYB, proof-of-address, sanctions, fraud, AML, Travel Rule, and
provider terms processes. Coin Card must not restate an Iron approval as a broader
Coin Card legal-identity verification claim.

### 2.3 Privacy boundary

Iron documents Virtual Accounts as named accounts issued in the customer's verified
name. The bank-payment instructions may therefore reveal the Coin Card holder's legal
beneficiary name.

A public Coin Card may remain pseudonymous until a payer selects **Pay by bank**. The
bank-payment surface must disclose the privacy consequence before revealing provider
instructions. Raw routing and account details must not be indexed or permanently
published on an unrestricted public page unless Iron expressly approves that design.

Coin Card must use provider-approved wording for the nature of the Virtual Account and
must not independently promise that it is a conventional bank account owned by the
holder.

### 2.4 Approved use is narrower than technical capability

Public Iron and MoonPay materials support third-party payments and identify freelancer
payments as a use case. That does not by itself approve every Coin Card category.
Creators, tips, donations, freelance invoices, sales of goods or services, personal
payments, and commercial payments require express written approval in the governing
partner agreement.

---

## 3. Frozen architecture invariant

> **A published fiat route is immutable across Coin Card and every provider control
> plane. Provider permissions prevent unauthorized mutation; Coin Card continuously
> reconciles authoritative provider configuration against a normalized immutable
> snapshot; every transaction is correlated through `autoramp_id`; and final delivery
> is independently established from Polygon native-USDC transfer logs.**

This means:

- Coin Card never edits the destination of a published Autoramp.
- Coin Card operators never edit a published Autoramp in Iron's Partner Dashboard.
- A wallet change creates a new registered wallet, a new Autoramp, and a new fiat-route
  version.
- Provider-side configuration drift immediately suspends presentation of the route.
- `autoramp_id` selects Coin Card's immutable historical route snapshot.
- Iron `Completed` is necessary but insufficient for the statement “USDC delivered.”
- Only independent Polygon settlement verification supports that statement.

Reconciliation is a compensating control, not a substitute for preventive access
control. An ACH or Wire may already be in flight when drift is detected. Inadequate
provider RBAC, auditability, or break-glass controls is therefore a launch blocker.

---

## 4. Pay-by-reference routing

Coin Card uses Iron pay-by-reference (PBR) Autoramps when Iron approves and enables
that configuration for the account.

Iron documents that multiple PBR Autoramps for one customer may share a Virtual
Account. Each Autoramp receives a required `inbound_payment_reference` in the form
`IR-XXXXXX`. A deposit without a matching reference is returned rather than
ambiguously routed.

```text
fiat route v3
  autoramp_id = AR-123
  reference   = IR-OLD123
  destination = wallet route v7 / 0xOld...

fiat route v4
  autoramp_id = AR-456
  reference   = IR-NEW456
  destination = wallet route v8 / 0xNew...
```

The PBR reference is routing-critical, not optional memo copy. Coin Card must present
it prominently and explain that it must be transmitted verbatim. Production validation
must establish how real U.S. ACH and Wire originators preserve and transmit it.

---

## 5. Fiat-route lifecycle

### 5.1 States

```text
ACTIVE
  Published and accepting transfers.

RETIRING
  No longer published.
  Previously issued instructions may still settle safely.

DISABLED
  Disabled at Iron.
  Further deposits must be rejected or returned under confirmed provider behavior.

SUSPENDED
  Coin Card detected integrity or configuration drift.
  Instructions are immediately withdrawn.
```

`SUSPENDED` is an incident state. It does not prove that an in-flight transfer was
stopped. Coin Card must continue monitoring all affected transactions and escalate to
Iron.

### 5.2 Activation sequence

```text
1. Verify the new Coin Card wallet route.
2. Register the destination wallet with Iron and complete required ownership proof.
3. Create a new PBR Autoramp targeting the exact chain, asset, and wallet.
4. Wait for Iron approval and deposit-rail readiness.
5. Read the authoritative Autoramp back from Iron using the pinned API version.
6. Normalize and compare it to Coin Card's intended execution fingerprint.
7. Persist the immutable fiat-route record and fingerprint hash.
8. Atomically publish the new fiat-route version.
9. Mark the prior route RETIRING and stop displaying its instructions.
```

If any step before publication fails, the prior published route remains unchanged.

### 5.3 Wallet change

The following operation is forbidden for a published route:

```text
PATCH AR-123: 0xOld... → 0xNew...
```

The required replacement sequence is:

```text
wallet route v8 verified
  → create AR-456
  → receive IR-NEW456
  → verify authoritative configuration
  → publish fiat route v4
  → retire fiat route v3 / AR-123 / IR-OLD123
  → disable v3 only after the contracted settlement and return policy permits it
```

A time-based drain period is not enough on its own because a payer may retain old bank
instructions indefinitely. Iron must define the behavior of a valid stale reference
sent to a disabled Autoramp.

---

## 6. Versioned execution fingerprint

Coin Card stores a normalized, versioned execution fingerprint. It must not hash raw
provider JSON because optional fields, ordering, formatting, and irrelevant metadata
may change without altering execution semantics.

Minimum V1 fields:

```text
execution_fingerprint_version: 1

provider
provider_environment
iron_api_version

customer_id
autoramp_id
kind
is_third_party

source_currencies
deposit_rails

destination_currency
destination_chain
destination_contract
destination_wallet

pbr_enabled
inbound_payment_reference

beneficiary_name
routing_and_account_identifiers

fee_profile_id
additional_partner_fee_in_bips
batch_payout
```

The normalized object must use a documented deterministic serialization, followed by
a domain-separated SHA-256 hash. The exact serialization profile must be specified
before implementation; it must not silently borrow a Coin Card signing profile whose
domain or schema does not authorize this object.

Fields are classified for reconciliation:

| Drift class | Examples | Required response |
|---|---|---|
| Destination or authority | customer, kind, third-party flag, asset, chain, contract, wallet, PBR reference | Suspend immediately; integrity incident |
| Economic or timing | fee profile, additional fee, batching | Suspend; commercial/evidence review |
| Deposit credentials | beneficiary, routing/account identifiers, enabled rails | Withdraw instructions; replace or reapprove route |
| Provider operational state | approved, edit pending, cancelled, disabled | Derive route availability; alert as applicable |
| Non-semantic metadata | display labels or additive fields with no execution effect | Record; no automatic suspension |

Unknown or unclassified changes fail closed until reviewed.

---

## 7. Control-plane integrity

### 7.1 Required preventive controls

Production must provide or contractually support:

- human accounts that are read-only by default;
- no ordinary operator permission to edit a published Autoramp;
- strongly authenticated, narrowly held break-glass access;
- auditable records for every Autoramp creation, edit, disablement, and cancellation;
- immediate notification of edit attempts and status changes;
- environment-separated credentials and roles;
- prompt credential and operator revocation;
- provider support procedures that cannot silently mutate a destination.

If Iron cannot prevent edits, Coin Card requires a provider-supported immutable lock or
an equivalent contractual/technical control. Polling alone is insufficient.

### 7.2 Reconciliation

Coin Card reconciles every `ACTIVE` and `RETIRING` Autoramp:

- before initial publication;
- before displaying payment instructions;
- periodically while the route remains live or draining;
- when an Autoramp-related webhook or status event arrives;
- when any provider operator or credential changes;
- before declaring an incident resolved.

The reconciler reads the authoritative Autoramp using the pinned API version, builds
the normalized fingerprint, and compares it to the immutable local snapshot.

```text
match
  → route may remain in its current lifecycle state

mismatch
  → FIAT_ROUTE_DRIFT_DETECTED
  → ACTIVE or RETIRING → SUSPENDED
  → withdraw instructions
  → alert operations and Iron
  → monitor possibly in-flight transfers
```

---

## 8. API versioning and idempotency

Every versioned Iron `/api` request must send an explicit `X-API-Version` matching the
dated OpenAPI contract used to generate or validate the client.

Coin Card records:

```text
iron_customer_creation_version
iron_api_version_requested
iron_api_version_served
```

The customer-creation version is distinct because Iron documents behavioral versions
whose onboarding order is pinned to the customer for the customer's lifetime.

Coin Card must validate the response `X-API-Version` header. A mismatch is rejected and
alerted. An exact idempotent POST replay is a documented exception: Iron may return the
stored response without response headers. Coin Card therefore preserves the original
served version in its idempotency record and accepts a headerless replay only when the
idempotency key and stored response identity match exactly.

Sandbox and production clients must be generated or checked against their respective
dated OpenAPI documents. Production parity is an empirical launch gate, not an
assumption based on the Sandbox reference pages.

---

## 9. Transaction correlation and webhooks

Webhooks are notification transport, not complete evidence objects.

```text
Iron webhook
  transaction id = TX-789
        ↓
verify HMAC and timestamp
        ↓
deduplicate transport by webhook-id
        ↓
enqueue TX-789
        ↓
GET /api/autoramp-transactions/ids?ids=TX-789
        ↓
authoritative transaction.autoramp_id = AR-456
        ↓
Coin Card lookup
  AR-456 → fiat route v4 → wallet route v8
```

Transport and semantic idempotency are separate:

```text
transport dedupe
  = webhook-id

semantic reconciliation
  = provider environment
  + iron_transaction_id
  + authoritative transaction_status
```

Coin Card uses Iron's current `transaction_status` field. The deprecated `status`
field must not drive lifecycle state.

Webhook handlers must:

- verify HMAC over the exact raw payload and timestamp;
- enforce a bounded timestamp tolerance;
- deduplicate retries by `webhook-id`;
- acknowledge only after durable intake;
- tolerate duplicates, delays, and out-of-order delivery;
- fetch authoritative transaction data before semantic state changes;
- use replay-safe forward transitions;
- reconcile by polling when webhook delivery is paused or unavailable.

---

## 10. Settlement evidence

### 10.1 Settlement states

```text
IRON_COMPLETED
  Iron reports payout completed.

SETTLEMENT_VERIFYING
  Coin Card is independently inspecting Polygon.

SETTLEMENT_VERIFIED
  Canonical native-USDC transfer evidence matches the immutable route snapshot.

SETTLEMENT_MISMATCH
  On-chain evidence conflicts with provider or Coin Card evidence.
```

Only `SETTLEMENT_VERIFIED` supports the externally meaningful claim “USDC delivered.”

### 10.2 Polygon verification

Coin Card must fetch the transaction identified by Iron's payout transaction hash and
verify:

```text
chain identity                 == Polygon (chain ID 137)
transaction receipt status     == success
token log emitting contract    == snapshotted canonical native-USDC contract
Transfer recipient             == snapshotted destination wallet
Transfer amount                == authorized expected payout amount in atomic units
required confirmation/finality == reached
```

The verifier must inspect token transfer logs. It must not require the transaction's
top-level `to` field to equal the recipient because the top-level destination may be a
token, payout, or batching contract. If a transaction contains multiple transfer logs,
the verifier must identify the exact log matching contract, recipient, and atomic
amount. Floating-point arithmetic is forbidden.

The exact Iron response field that authorizes the expected payout amount must be fixed
by the pinned production schema and validation evidence before implementation. Coin Card
must not guess whether a gross, net, quoted, or destination field governs.

The three evidence authorities are:

1. Coin Card's immutable route snapshot — what Coin Card intended and published.
2. Iron's authoritative transaction record — what provider transaction handled the
   deposit and what lifecycle/amount/fee/hash Iron reported.
3. Polygon settlement — what native-USDC transfer actually occurred.

Provider completion and on-chain verification must agree. Any mismatch is an integrity
incident and cannot be promoted as successful delivery.

---

## 11. Evidence record

The normalized evidence record must preserve at least:

```text
coin_card_id
coin_card_handle

fiat_route_id
fiat_route_version
wallet_route_id
wallet_route_version
execution_fingerprint_version
execution_fingerprint_hash

provider: iron
provider_environment
iron_customer_id
iron_autoramp_id
iron_virtual_account_or_deposit_rail_ids
inbound_payment_reference

iron_customer_creation_version
iron_api_version_requested
iron_api_version_served

iron_transaction_id
iron_transaction_status
source_amount
destination_amount
fees
payment_tracking

payout_transaction_hash
polygon_chain_identity
usdc_contract
transfer_log_index
transfer_recipient
transfer_amount_atomic
receipt_status
confirmation_or_finality_evidence
settlement_verification_status

created_at
provider_completed_at
settlement_verified_at
```

Sensitive sender, banking, and tracking data must follow a documented minimization,
encryption, access, and retention policy. Public evidence must not expose private bank
instructions or unnecessary payer information.

This architecture does not modify the sealed Coin Card Transaction Evidence contracts.
Implementation must either map this rail into an already-authorized evidence shape or
define and seal a purpose-specific successor contract before production use.

---

## 12. Customer-facing status and timing

Coin Card must not promise a fixed ACH or Wire delivery time until the partner contract
provides an enforceable SLA. Current public estimates vary by rail, banking partner,
cutoff, compliance review, and network conditions.

Permitted general copy:

> Usually settles within several business days.

Status copy must follow authoritative lifecycle facts:

```text
Payment received
Reviewing funds
Converting to USDC
Sending USDC
Verifying delivery
Completed
```

“Completed” and “USDC delivered” require `SETTLEMENT_VERIFIED`, not merely an Iron frame,
webhook, or `Completed` status.

---

## 13. Frozen launch gates

No production launch may occur until every gate satisfies the decision standard in
`fiat-routing/IRON_COIN_CARD_FIAT_RAIL_DILIGENCE_MASTER_V1.md` with retained evidence:

1. Production RBAC, audit logs, and break-glass controls prevent or make enforceable
   the immutable-configuration rule.
2. Iron defines the exact behavior of deposits referencing disabled Autoramps.
3. PBR references survive real ACH and Wire originators and fail closed when absent or
   invalid.
4. Production API and schemas satisfy the pinned, tested dated-version contract.
5. The partner agreement expressly approves the intended payment categories.
6. ACH return, fraud, reversal, reserve, recovery, and post-settlement loss allocation
   are acceptable.
7. Pricing, volume commitments, limits, availability, support, and partner liability
   are commercially acceptable.

An approved diligence exception cannot waive or weaken this document's frozen routing,
control-plane, custody, evidence, or settlement invariants.

The detailed questions and proof obligations live in:

- `fiat-routing/IRON_PROVIDER_DILIGENCE_QUESTIONNAIRE_V1.md`
- `fiat-routing/IRON_PROVIDER_VALIDATION_MATRIX_V1.md`
- `fiat-routing/IRON_COIN_CARD_FIAT_RAIL_DILIGENCE_MASTER_V1.md`

---

## 14. Explicit non-goals

This architecture does not authorize:

- MoonPay Platform Buy to an unrelated recipient wallet;
- Coin Card custody of fiat or stablecoins;
- public indexing of Virtual Account credentials;
- a claim that Coin Card verified the holder's legal identity;
- mutable published Autoramps;
- final delivery claims based only on provider status;
- arbitrary payment categories not approved by contract;
- implementation before all launch gates pass.

---

## 15. Official source record

Sources were reviewed on 2026-08-08. Public documentation supports product and
technical diligence but does not replace the executed partner agreement or legal review.

### Iron

- [Virtual Accounts](https://docs.iron.xyz/account)
- [Autoramp and pay by reference](https://docs.iron.xyz/autoramp)
- [Get an Autoramp by ID](https://docs.iron.xyz/reference-sandbox/autoramp/get-an-autoramp-by-id)
- [Get Autoramp transactions by transaction IDs](https://docs.iron.xyz/reference-sandbox/autoramp/get-autoramp-transactions-by-transaction-ids)
- [Transaction status](https://docs.iron.xyz/transaction-status)
- [Webhooks](https://docs.iron.xyz/webhooks)
- [API Versions](https://docs.iron.xyz/versioning)
- [Payment Methods](https://docs.iron.xyz/fiat-payment-methods)
- [Integration Models](https://support.moonpay.com/en/articles/682938-integration-models-api-dashboard)

### MoonPay / Virtual Accounts

- [Virtual Accounts explained](https://support.moonpay.com/en/articles/381402-virtual-accounts-explained)
- [USD deposits by ACH or Wire](https://support.moonpay.com/en/articles/727237-virtual-account-deposits-via-ach-or-wire-usd)
- [Processing times, fees, and limits](https://support.moonpay.com/en/articles/727279-virtual-accounts-processing-times-fees-and-limits)
- [Supported countries, currencies, and stablecoins](https://support.moonpay.com/en/articles/681880-supported-countries-currencies-and-stablecoins-for-virtual-accounts)
- [Virtual Accounts for businesses](https://www.moonpay.com/business/virtual-accounts)

### MoonPay Platform Buy boundary

- [MoonPay U.S. Terms of Use](https://www.moonpay.com/legal/terms_of_use_usa)
- [MoonPay Express Checkout Terms](https://www.moonpay.com/legal/terms_of_use_express_checkout)
- [MoonPay legal routing page](https://www.moonpay.com/legal/terms)
- [MoonPay Platform card guide](https://dev.moonpay.com/platform/guides/pay-with-card)
