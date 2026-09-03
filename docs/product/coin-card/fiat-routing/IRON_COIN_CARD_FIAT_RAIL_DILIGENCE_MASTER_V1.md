# Iron / Coin Card Fiat Rail

## Provider Diligence Questionnaire and Launch Validation Master V1

**Status:** PRE-LAUNCH DILIGENCE
**Architecture status:** FROZEN
**Created:** 2026-08-08
**Architecture authority:**
`../COIN_CARD_IRON_FIAT_ROUTING_ARCHITECTURE_V1.md`
**Detailed question bank:** `IRON_PROVIDER_DILIGENCE_QUESTIONNAIRE_V1.md`
**Working tracker:** `IRON_PROVIDER_VALIDATION_MATRIX_V1.md`
**Evidence root:** `../../../operations/evidence/coin-card-iron-fiat-routing/`

---

## 1. Purpose

Determine whether Iron Virtual Accounts can safely, operationally, economically, and
contractually support Coin Card's third-party USD to recipient-owned native Polygon USDC
receiving rail.

This is the master go/no-go diligence authority. The frozen architecture defines how an
approved rail must work. This document defines what must be proven before that rail may
launch. The detailed questionnaire expands the questions; the working tracker records
owners, tests, evidence, and dispositions.

No document in this package makes the Iron rail a committed Coin Card feature. Before
implementation or customer-facing publication, the governing Commercial Specification
and downstream legal, privacy, engineering, and evidence contracts must expressly
authorize the capability.

---

## 2. Decision standard

The integration may proceed to production only when every launch-blocking requirement
has one of these dispositions:

- `PASS` — satisfactory binding documentary evidence and required empirical evidence;
- `APPROVED_EXCEPTION` — a bounded, formally documented exception accepted by Coin
  Card's authorized risk/compliance decision-maker and enforced where applicable.

The following never override a contradictory contract, compliance rule, security
requirement, or operating constraint:

- a successful API call;
- a successful sandbox transaction;
- a successful production transaction;
- a verbal sales assurance;
- functionality that appears technically possible.

Row-level `CONDITIONAL` is not an allowed passing disposition. `CONDITIONAL PASS` is
reserved for the final launch decision and requires every limitation to be technically
enforced, with all affected tracker rows either `PASS` or `APPROVED_EXCEPTION`.

An `APPROVED_EXCEPTION` cannot waive or weaken a frozen architecture invariant. It
cannot authorize ambiguous routing, mutable published destinations, false delivery
claims, Coin Card custody, unsupported legal use, or unverifiable settlement. A proposed
exception that contradicts the frozen architecture is a `FAIL` unless the architecture
is formally reopened and replaced through its governing authority process.

### 2.1 Repository change discipline

> **No diligence answer changes architecture by implication.**

An Iron answer may do only one or more of the following:

1. Provide evidence for an existing requirement.
2. Move a tracker row to `PASS` after the required review.
3. Support a bounded `APPROVED_EXCEPTION` under this decision standard.
4. Reveal a concrete contradiction serious enough to invoke the frozen architecture's
   formal reopen rule.

Recording a provider answer must not opportunistically edit the route model, weaken an
invariant, redefine a state, or normalize provider behavior that conflicts with the
frozen architecture. Architecture changes require an explicit reopening decision and a
new governed architecture revision; they must never be smuggled into an evidence update.

---

## 3. Frozen architecture summary

```text
Third-party payer
  → ACH / Wire USD
  → recipient's Iron Virtual Account
  → immutable Iron PBR Autoramp
  → automatic conversion
  → native USDC on Polygon
  → recipient-controlled verified wallet
  → independent Polygon settlement verification
```

Coin Card takes custody of neither fiat nor USDC.

A wallet or destination change requires:

1. A new verified wallet route.
2. A new Iron Autoramp.
3. A new pay-by-reference identifier.
4. A new Coin Card fiat-route version.
5. Authoritative readback and execution-fingerprint verification.
6. Atomic publication of the replacement route.
7. The prior route enters `RETIRING`.
8. The prior Autoramp remains untouched while it safely drains.
9. The prior Autoramp is disabled only under validated Iron behavior.

Published Autoramps may be disabled but must never be edited through any API,
Dashboard, provider-support, banking-partner, or other control plane.

---

## 4. Required route states

### `ACTIVE`

Current payment instructions are displayed and transfers may be initiated.

### `RETIRING`

Instructions are no longer displayed, but previously distributed instructions may
still settle safely through the unchanged route.

### `DISABLED`

Iron has disabled the Autoramp. New transfers using those instructions must fail or
return according to empirically validated and contractually confirmed behavior.

### `SUSPENDED`

Coin Card detected a security, provider, configuration, compliance, or integrity
condition that prevents safe route presentation. Instructions are withdrawn
immediately. Suspension does not prove that an already in-flight bank transfer stopped.

---

## 5. Required settlement states

### `IRON_COMPLETED`

Iron reports that its payout process completed. This status alone is not Coin Card
delivery evidence.

### `SETTLEMENT_VERIFYING`

Coin Card is independently inspecting the Polygon transaction and native-USDC logs.

### `SETTLEMENT_VERIFIED`

Coin Card confirmed the expected native-USDC transfer against the immutable route
snapshot. Only this state permits the statement **“USDC delivered.”**

### `SETTLEMENT_MISMATCH`

Iron's reported settlement and Polygon's observed settlement do not match the immutable
Coin Card route snapshot. This is an integrity incident.

---

## 6. Diligence requirements

The questions below define the master review scope. The detailed wording and response
record template live in `IRON_PROVIDER_DILIGENCE_QUESTIONNAIRE_V1.md`.

### 6.1 Phase 1 — no-code diligence order

Phase 1 gathers provider, contractual, commercial, risk, security, behavioral, and API
commitments without writing integration code or moving real money. Work proceeds in this
fail-fast order:

| Order | Focus | Master rows | Reason / stop condition |
|---:|---|---|---|
| 1 | Product and contractual permission | V01, V02, V38, V39 | Stop if Iron will not approve the intended Coin Card uses, public/controlled Pay-by-bank surface, or required legal-name disclosure model |
| 2 | Liability and economics | V33–V37 | Stop if ACH-return/fraud exposure, reserves, pricing, or limits make the rail unacceptable or uneconomic |
| 3 | Control-plane safety | V13–V15, V42 | Stop if production RBAC and audit controls cannot enforce immutable published Autoramps |
| 4 | Provider behavioral guarantees | V04–V10 | Stop if persistent accounts, PBR correlation, disabled routes, stale references, or route lifecycle cannot fail closed |
| 5 | Production API contract | V07, V08, V18–V20, V40, V41 | Stop before implementation if Iron will not commit to the required pinned production contract and correlation evidence |

Later groups may be discussed in parallel when efficient, but no deeper work may be used
to rationalize a failure in an earlier launch-blocking group. Phase 1 ends with documented
answers, evidence references, dates, accountable reviewers, and auditable dispositions.

### A. Product and commercial-use approval

Iron must expressly approve unrelated third-party USD deposits to the recipient's
Virtual Account. The governing agreement must classify each intended category as
permitted or prohibited and define limits, sender information, recipient disclosures,
geographies, and enhanced monitoring for:

- personal transfers;
- creator support and tips;
- donations and gifts;
- freelance and contractor payments;
- invoices;
- salary or compensation;
- commercial payments;
- payments for goods or services;
- recurring payments.

Coin Card may not advertise or enable an unapproved category.

Iron must separately approve the public **Pay by bank** surface, including whether
instructions may be shown without authentication, copied, shared, encoded in QR codes,
cached, or indexed, or whether they must be revealed in a controlled flow.

### B. Customer, KYC, and privacy

Iron must confirm that the recipient/Virtual Account holder is its customer and verified
destination-wallet controller. The third-party bank sender must not be represented as
the owner of that wallet.

Iron must document recipient legal-name, date-of-birth, address, tax, identity-document,
proof-of-address, sanctions, monitoring, and business-verification requirements.

The bank-payment surface must accurately disclose the required legal beneficiary name.
Coin Card must know whether a display name may also appear and whether the public Coin
Card can remain pseudonymous until **Pay by bank** is selected.

Iron must identify which sender facts are guaranteed, conditional, rail-specific, or
unavailable, including originating name/bank/account metadata, ACH trace, Wire reference
and message, payment reference, timestamp, amount, rail, country, and return data.

### C. Virtual Account persistence and provisioning

Coin Card requires documented sandbox and production support for programmatic customer
creation, terms, KYC/KYB, wallet registration, Virtual Account/deposit-rail provisioning,
PBR Autoramp creation, lookup, disablement, transactions, and webhooks.

The preferred design requires one verified customer to retain a persistent USD Virtual
Account while Coin Card creates multiple sequential PBR Autoramps beneath it.

Iron must define bank-partner migration behavior for routing/account-number changes,
account reissuance or closure, provider migration, and beneficiary formatting. Coin Card
requires notice and programmatic detection before stale credentials can be presented.

### D. Pay by reference

Iron must confirm:

- multiple PBR Autoramps may share one customer's Virtual Account;
- every Autoramp receives an environment/account-lifetime unique `IR-XXXXXX` reference;
- exact matching and normalization rules;
- deterministic behavior for correct, absent, invalid, malformed, cross-customer, stale,
  and disabled references;
- return timing, fees, webhooks, transactions, and customer notifications;
- the correct ACH and Wire fields senders must use;
- preservation behavior across consumer, business, bill-pay, payroll, and fintech
  originators;
- permanent transaction-to-`autoramp_id` correlation;
- whether the exact received reference is exposed and which field contains it.

If the exact received PBR reference is not exposed, `autoramp_id` must be permanently
bound to the rule that matched the payment, including after disablement.

### E. Autoramp immutability and control plane

Iron must support Coin Card's policy that published Autoramps are never edited.

Production requires:

- read-only ordinary operators;
- narrowly scoped automation/API credentials;
- exceptional break-glass administration with strong authentication;
- complete audit records for Autoramp, fee, PBR, deposit-credential, role, and
  administrator changes;
- actor, timestamp, before/after values, control plane, and request/audit ID;
- complete notification of execution-affecting changes;
- provider-internal and banking-partner changes covered by the same discipline.

`EditPending` alone is insufficient unless Iron contractually confirms that it is a
complete change-monitoring mechanism.

Iron must also explain which configuration controls an in-flight transfer if an Autoramp
is changed: banking-rail initiation, Iron recognition, compliance completion, conversion,
or payout-time configuration. Coin Card does not rely on mutation semantics operationally,
but the answer is required for incident analysis.

### F. Execution fingerprint

Coin Card will map the pinned production schema to this normalized fingerprint:

```text
execution_fingerprint_version
customer_id
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

Drift response:

| Class | Examples | Response |
|---|---|---|
| Destination/economic | wallet, chain, token, fee profile, partner fee, third-party mode, batching | `ACTIVE`/`RETIRING` → `SUSPENDED`; integrity incident |
| Deposit credential | routing/account number, beneficiary, PBR reference | Withdraw instructions; replacement-route workflow |
| Provider status | pending, disabled, unavailable, compliance hold | Apply validated availability mapping |
| Non-semantic metadata | no execution or instruction effect | Audit only |

Unknown fields fail closed until classified.

### G. API versioning

Coin Card will not follow Iron's latest/default version automatically. The production
client and schema use the exact dated `X-API-Version` certified during validation.

Coin Card records:

```text
iron_customer_creation_version
iron_api_version_requested
iron_api_version_served
```

Iron must identify customer-lifetime behavior pinned at creation and confirm the normal
response-version echo. Coin Card retains the original served version in the idempotency
record because an exact idempotent POST replay may legitimately omit response headers.

### H. Webhooks and reconciliation

Iron must document production HMAC algorithm, secret format, timestamp, exact signed
payload, tolerance, retries, and key rotation.

Coin Card's required sequence is:

```text
receive raw webhook
  → verify timestamp and HMAC
  → deduplicate transport by webhook-id
  → durably enqueue Iron resource ID
  → fetch authoritative resource using pinned API version
  → resolve autoramp_id
  → resolve immutable Coin Card fiat route
  → reconcile execution fingerprint
  → apply forward-only state transition
  → independently verify Polygon when payout hash exists
```

Webhooks are unordered notifications, never full business authority.

### I. Disabled Autoramps

Coin Card must test a transfer using an old valid reference after disablement and a
transfer initiated while active but processed after disablement. Required facts include
transaction creation, acceptance/return, timing, fees, webhooks, statuses, intervention,
and the lifecycle boundary that controls the result.

### J. Returns, fraud, and reversals

The governing agreement must allocate loss and recovery rights for ACH returns after
USDC payout, unauthorized ACH, account takeover, stolen credentials, fraudulent or
mistaken Wire, impersonation, sanctions failures, and recipient fraud.

Iron must disclose whether it may debit Coin Card or the recipient, create a negative
balance, withhold future payouts, require prefunding/reserves/guarantees, or recover after
self-custodial delivery. Formula, duration, release, insurance, indemnity, and liability
terms must be acceptable.

### K. Economics and limits

The final schedule must cover ACH, Wire, conversion, USDC, Polygon payout, Virtual
Accounts, KYC, returns, failed PBR, compliance review, partner fees, implementation,
support, monthly/volume commitments, and reserves.

Limits must be supplied by customer, transaction, day, month, sender, rail, jurisdiction,
KYC level, and payment category.

### L. Polygon native USDC

Iron must supply its exact production asset definition: chain ID `137`, network, native-
USDC contract, decimals, and provider identifier. Coin Card independently confirms those
facts against authoritative chain/token sources.

Iron must confirm arbitrary approved recipient-controlled Polygon addresses and describe
batching. The tested schema must establish which expected payout field corresponds to
the ERC-20 transfer amount.

---

## 7. Independent settlement verification

For every final payout, Coin Card must verify:

1. The transaction exists on Polygon.
2. The transaction receipt succeeded.
3. Chain ID is `137`.
4. The snapshotted canonical native-USDC contract emitted the relevant event.
5. ERC-20 `Transfer.to` equals the immutable route wallet.
6. `Transfer.value` equals the authorized expected payout in USDC atomic units.
7. The required Coin Card finality threshold has been reached.

The top-level transaction `to` field is insufficient. Batched transactions require
selection of the exact log matching token contract, recipient, and amount. Ambiguous
duplicate matches fail closed unless a sealed evidence contract authorizes an additional
discriminator.

---

## 8. Master launch-validation matrix

The working tracker expands these rows with owner, status, evidence link, tested date,
API version, environment, and notes.

| ID | Gate / test | Required evidence | PASS | FAIL / launch blocker |
|---|---|---|---|---|
| V01 | Third-party deposits permitted | Binding partner/compliance documentation | Unrelated senders expressly permitted | Ambiguous, prohibited, or self-funding only |
| V02 | Commercial-use categories | Written permitted-use schedule | Required Coin Card categories approved | Intended categories excluded or ambiguous |
| V03 | Polygon native USDC supported | Production asset/config response | Chain 137 and canonical native USDC confirmed | Wrong chain/token or unavailable |
| V04 | Persistent Virtual Account | Production/sandbox API evidence | Account persists across Autoramp versions | New bank account required for every route |
| V05 | Multiple PBR Autoramps | API tests | Same account supports distinct references | One Autoramp only or ambiguous sharing |
| V06 | PBR fail-closed | Approved ACH/Wire tests | Invalid/missing reference safely returned | Payment ambiguously routed |
| V07 | `autoramp_id` correlation | Transaction API response | Every transaction resolves to exact Autoramp | Matching rule cannot be determined |
| V08 | Exact PBR visibility | Transaction/API evidence | Received reference observable | Acceptable only if V07 permanently binds transaction to rule |
| V09 | Disabled Autoramp behavior | Empirical test and written explanation | Deterministic safe failure/return | Funds can route unpredictably |
| V10 | In-flight disable behavior | Empirical test | Behavior documented and reproducible | Undefined or inconsistent |
| V11 | ACH reference preservation | Multi-originator testing | Product-acceptable preservation | Material truncation or omission |
| V12 | Wire reference preservation | Multi-originator testing | Reference reliably preserved | Material loss or transformation |
| V13 | Provider RBAC | Production security review | Ordinary humans cannot edit published Autoramps | Standard operators can edit |
| V14 | Break-glass controls | Provider security evidence | Strong authentication, narrow role, full audit | Uncontrolled privileged mutation |
| V15 | Configuration audit trail | Provider evidence | Actor, time, source, and before/after retained | Material changes unaudited |
| V16 | Execution-fingerprint readback | API reconciliation test | All critical fields available | Execution drift cannot be detected |
| V17 | Drift suspension | Coin Card test | Critical mismatch immediately suspends route | Drift remains published |
| V18 | API version pinning | Integration test | Tested version explicitly requested | Relies on latest/default |
| V19 | Served-version handling | Integration test | Version verified and recorded | Unexpected version accepted |
| V20 | Idempotency replay | Integration test | Headerless replay safely recognized from stored record | False anomaly or duplicate state |
| V21 | Webhook HMAC | Security test | Invalid signature/timestamp rejected | Spoofed webhook accepted |
| V22 | Webhook duplicates | Replay test | Same delivery produces one transport effect | Duplicate business transition |
| V23 | Out-of-order webhooks | Sequence test | State never regresses | Older event overwrites newer state |
| V24 | API reconciliation | Webhook test | Notification triggers authoritative fetch | Webhook treated as complete truth |
| V25 | Iron completion boundary | Lifecycle test | Enters `IRON_COMPLETED` only | UI claims delivery prematurely |
| V26 | Polygon payout hash | Completed transaction | Hash supplied and retrievable | No settlement reference |
| V27 | Polygon receipt | RPC evidence | Successful receipt on chain 137 | Failed or wrong-chain transaction |
| V28 | Native-USDC emitter | Receipt log | Canonical contract emitted transfer | Wrong token contract |
| V29 | Recipient verification | ERC-20 log | `Transfer.to` equals route snapshot | Recipient mismatch |
| V30 | Amount verification | ERC-20 log | Atomic amount equals authorized payout | Amount mismatch |
| V31 | Finality | Confirmation test | Required threshold reached | Evidence issued too early |
| V32 | Settlement mismatch handling | Fault injection | Integrity incident and no success promotion | Mismatch treated as success |
| V33 | ACH-return liability | Contract | Loss allocation expressly accepted | Undefined material liability |
| V34 | Post-payout fraud | Contract | Recovery/reserve obligations understood | Unlimited or undefined exposure |
| V35 | Reserve requirements | Commercial agreement | Economically acceptable | Capital requirement unacceptable |
| V36 | Partner pricing | Final commercial schedule | Unit economics viable | Target payments uneconomic |
| V37 | Transaction limits | Production configuration | Intended uses fit limits | Limits incompatible with product |
| V38 | Public Pay-by-bank UX | Written provider approval | Intended public/controlled surface approved | Details cannot be safely exposed |
| V39 | Legal-name disclosure | UX/compliance test | Accurate privacy disclosure is possible | Conflicts with Coin Card promise |
| V40 | Production schema parity | Production contract validation | Required fields match pinned schema | Sandbox-only assumption |
| V41 | Customer-creation version | Onboarding test | Creation version permanently captured | Behavior cannot be reconstructed |
| V42 | Autoramp immutability | Operational control test | Normal control planes cannot mutate published route | Published Autoramps remain editable |
| V43 | Route-replacement atomicity | Failure test | Old route remains active until replacement is fully valid | Partial activation possible |
| V44 | `RETIRING` behavior | Stale-instruction test | Old valid instructions settle safely while enabled | Stale transfers become unsafe |
| V45 | Evidence completeness | End-to-end test | Route, Iron, and chain records reconcile | Final evidence chain incomplete |

---

## 9. Required launch evidence package

### Contractual

- Executed partner agreement and product/use-case approval.
- Permitted payment-category schedule.
- Liability, indemnity, ACH-return, fraud, and reserve terms.
- Public payment-instruction approval.

### Product and API

- Pinned production OpenAPI specification and generated/validated client identity.
- Tested request version and customer-creation version.
- Approved production customer, Virtual Account, PBR Autoramp, and authoritative
  transaction samples.

### Security

- Provider RBAC, audit-log, and break-glass evidence.
- Coin Card execution-fingerprint specification.
- Drift, webhook-signature, duplicate, and out-of-order test results.

### Banking

- ACH and Wire PBR test matrices.
- Disabled-reference and in-flight-disable results.
- Approved return tests and observed lifecycle evidence.

### Blockchain

- Polygon native-USDC asset authority.
- Iron payout hash, Polygon receipt, decoded ERC-20 log, recipient/amount match, and
  finality evidence.

### Commercial and operations

- Pricing, limits, commitments, reserves, support, escalation, migration, and exit terms.

---

## 10. Final launch decision

### `PASS`

Launch is permitted only when all launch-blocking rows are `PASS` or an authorized,
bounded `APPROVED_EXCEPTION`; no settlement-integrity contradiction remains; product
claims match contractual permissions; control-plane restrictions enforce immutability;
PBR behavior is reliable; post-settlement risk is accepted; and independent Polygon
verification succeeds end to end.

### `CONDITIONAL PASS`

Permitted only for explicitly bounded and technically enforced limitations, such as:

- ACH only or Wire only;
- restricted geography or amount;
- invoices but not donations;
- authenticated instructions instead of publicly visible bank details.

Each affected tracker row must identify the approved exception, enforcement mechanism,
owner, and retained evidence. A note or policy statement without enforcement is not a
conditional pass.

### `FAIL`

The rail does not launch if any required condition permits ambiguous routing, mutable
published destinations without adequate prevention, unverifiable transaction-to-route
correlation, unsupported payment use, uncontrolled post-settlement liability, inability
to verify Polygon delivery, or contradiction between Coin Card claims and governing Iron
terms.

---

## 11. Governing principle

> Provider permissions prevent mutation where possible; Coin Card reconciliation detects
> configuration drift; immutable route snapshots preserve intent; `autoramp_id`
> correlates provider execution; and Polygon independently proves final settlement.

The architecture remains frozen unless diligence or empirical testing demonstrates that
one of those assumptions cannot be satisfied.
