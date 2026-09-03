# Iron Provider Diligence Questionnaire V1

**Status:** OPEN — answers and written evidence required
**Architecture authority:**
`../COIN_CARD_IRON_FIAT_ROUTING_ARCHITECTURE_V1.md`
**Master diligence authority:** `IRON_COIN_CARD_FIAT_RAIL_DILIGENCE_MASTER_V1.md`
**Created:** 2026-08-08
**Owner:** Coin Card product, security, engineering, legal, and finance review

---

## Purpose

This questionnaire determines whether Iron can honor Coin Card's frozen fiat-routing
architecture in production. A verbal sales assurance is not sufficient. Each answer
must be supported by at least one of:

- executed contract or addendum;
- written product/compliance approval from an authorized Iron representative;
- versioned production API documentation;
- production Partner Dashboard evidence;
- reproducible sandbox or approved production test evidence.

Record answers, respondent identity/authority, date, source document, and any account-
specific enablement requirement. Ambiguous answers remain open.

---

## Gate 1 — Production RBAC, audit, and immutable configuration

### Roles and permissions

1. Which Partner Dashboard roles exist in production?
2. Can Coin Card create a read-only operator role?
3. Can Autoramp create, edit, disable, and cancel permissions be granted separately?
4. Can ordinary operators be prevented from editing a published Autoramp while still
   allowing transaction support and reconciliation?
5. Can API credentials be scoped separately for read, create, and mutation operations?
6. Can production and sandbox roles, credentials, webhooks, and data be fully isolated?
7. Does Iron support SSO, enforced MFA/2FA, hardware-backed authentication, IP/network
   restrictions, or approval workflows for privileged changes?

### Break-glass access

8. Can Coin Card maintain a normally disabled break-glass role for exceptional route
   disablement or incident response?
9. Can break-glass activation require two-person approval?
10. Does activation and every action taken under that role produce immutable audit
    evidence?

### Change auditability

11. Is every Autoramp creation, edit, approval, disablement, cancellation, and provider-
    initiated migration recorded in an audit log?
12. Does each record include actor, actor type, timestamp, prior value, new value,
    control plane, reason, and correlation identifier?
13. Can Coin Card retrieve the audit log through an API or export it for independent
    retention?
14. Is there a webhook for every Autoramp configuration mutation, not merely status
    changes such as `EditPending`?
15. Can Iron support staff or banking partners change an Autoramp destination or deposit
    rail without generating the same audit evidence and notification?
16. Can Iron place a provider-side immutable lock on an approved Autoramp destination?
17. If no lock exists, what preventive control does Iron propose that is stronger than
    periodic reconciliation?

**Gate 1 pass condition:** Coin Card can prevent ordinary mutation of published
Autoramps, tightly control exceptional changes, and independently retain complete change
evidence. Monitoring alone does not pass.

---

## Gate 2 — Disabled and retired Autoramps

1. What exact lifecycle state results from disabling versus cancelling an Autoramp?
2. What happens when a deposit with a valid PBR reference arrives after its Autoramp is
   disabled?
3. What happens when it arrives after cancellation?
4. Is the deposit rejected before compliance/conversion, or can it still settle?
5. Is it automatically returned to the originating bank account?
6. What is the return timeline for ACH and Wire?
7. Which party pays banking, return, compliance, or processing fees?
8. Which webhook and transaction records are emitted for rejected or returned deposits?
9. Does Coin Card receive an `autoramp_id` and transaction ID for the returned deposit?
10. Can a disabled Autoramp be re-enabled, and does it retain the same PBR reference and
    Virtual Account?
11. Can references ever be reassigned to a different Autoramp or customer?
12. How long must a retiring Autoramp remain enabled to cover in-flight ACH and Wire?
13. How should Coin Card handle a payer who saved valid but retired instructions for
    months or years?
14. Can Iron reject a stale reference permanently while preserving the customer's other
    Autoramps on the shared Virtual Account?

**Gate 2 pass condition:** stale and disabled instructions fail predictably without
ambiguous routing, and Coin Card can observe and explain the resulting return lifecycle.

---

## Gate 3 — Pay-by-reference behavior across ACH and Wire

1. Confirm PBR support for the exact USD `AchWire` configuration intended for Coin Card.
2. Confirm that multiple PBR Autoramps for one Iron customer can share one stable USD
   Virtual Account while retaining distinct `inbound_payment_reference` values.
3. In which ACH field must an originating bank place `IR-XXXXXX`?
4. In which Wire field must it be placed?
5. Which U.S. banks and bank-transfer user interfaces are known to preserve the value
   verbatim?
6. Are case, whitespace, punctuation, truncation, or bank-added prefixes normalized?
7. What exact matching algorithm is used?
8. What happens when a reference is absent, malformed, truncated, duplicated, or belongs
   to another customer?
9. Does every unmatched deposit return automatically?
10. Does `GET /api/autoramp-transactions/ids` expose the exact received or matched PBR
    reference? If so, identify the field for each rail.
11. Are `payment_tracking.ach_payment_reference` and `wire_message` guaranteed to contain
    the PBR value, or are they different bank/provider references?
12. Does `autoramp_id` permanently identify the rule that matched the deposit?
13. Are there minimum or maximum lengths or character restrictions beyond the documented
    `IR-XXXXXX` form?
14. Can a sender submit one transfer containing multiple references or split a payment
    across multiple transfers?
15. What sender copy and field labels does Iron require Coin Card to display?

**Gate 3 pass condition:** supported real originators preserve the reference, Iron
matches it deterministically, and absent/invalid references fail closed with observable
returns.

---

## Gate 4 — Production API and versioned schema guarantees

1. Which dated `X-API-Version` should Coin Card adopt for production?
2. Confirm that the selected version is supported in both sandbox and production.
3. Confirm production parity for:
   - `GET /api/autoramps/{autoramp_id}`;
   - `GET /api/autoramp-transactions/ids`;
   - customer/KYC endpoints;
   - wallet-registration endpoints;
   - PBR Autoramp creation;
   - transaction and transaction-status webhooks.
4. Confirm that the production Autoramp transaction includes `autoramp_id`, source and
   destination amounts, fee breakdown, third-party status, payment tracking, and crypto
   payout transaction hash.
5. Confirm that the production Autoramp resource exposes customer, kind, third-party
   flag, sources, destination, recipient wallet, deposit rails, PBR reference, fees,
   batching, and status under the pinned version.
6. Does every normal `/api` response echo `X-API-Version`?
7. Confirm the documented exception for idempotent POST replays that return a stored body
   without response headers.
8. What is the support and deprecation window for a dated API version?
9. How much notice precedes a forced version migration?
10. Can optional fields or open-ended values be added to an existing dated version?
11. Are sandbox and production dated OpenAPI specifications subject to automated parity
    checks by Iron?
12. Can account-specific configuration change a response shape or remove a documented
    rail without a version change?
13. Which API behavior is pinned to the customer at creation rather than selected per
    request?

**Gate 4 pass condition:** Coin Card can pin, generate against, test, and monitor a dated
contract whose production behavior is documented and operationally supportable.

---

## Gate 5 — Approved customers and payment categories

1. May an individual Coin Card holder receive unrelated third-party payments through a
   named USD Virtual Account?
2. Are the following categories expressly permitted:
   - creator support and tips;
   - donations;
   - gifts and personal payments;
   - freelance and contractor invoices;
   - salary and payroll;
   - business invoices;
   - sale of goods;
   - sale of services;
   - recurring customer payments?
3. Which categories require a Person customer versus a Business customer?
4. Which categories are prohibited or require enhanced diligence?
5. May Coin Card present **Pay by bank** on a publicly accessible Coin Card page?
6. May account/routing details be revealed after a payer action without payer login?
7. May those details ever be indexed, cached, embedded, copied, or shared by the payer?
8. What provider, bank, regulatory, and conversion disclosures must appear?
9. Must the payer see or enter the recipient's verified legal name?
10. Can the Coin Card identity remain pseudonymous outside the bank-payment surface?
11. Does Coin Card have any obligation to collect payer identity or purpose-of-payment
    information before showing instructions?
12. What transaction monitoring or source-of-funds obligations belong to Coin Card?
13. Which Iron/MoonPay entity and customer terms govern U.S. Coin Card holders?
14. Is the intended USD → native Polygon USDC configuration contractually approved for
    Coin Card's account?

**Gate 5 pass condition:** the signed partner agreement and applicable customer terms
expressly cover Coin Card's actual customers, presentation, and payment categories.

---

## Gate 6 — Returns, fraud, reversals, reserves, and recovery

1. When is an ACH deposit considered final enough for Iron to deliver USDC?
2. Does Iron hold ACH funds through the applicable return window before conversion or
   payout?
3. Can ACH be returned, reversed, disputed, or alleged fraudulent after USDC delivery?
4. Who bears the loss if fiat is returned after irreversible Polygon settlement?
5. May Iron debit Coin Card, the recipient, future deposits, reserves, or another account?
6. May Iron freeze, net, withhold, or reverse other customer funds to recover a loss?
7. Does Iron require a rolling reserve, prefunding, guarantee, or minimum balance?
8. What warranties or indemnities does Coin Card give regarding senders, payment purpose,
   fraud, or recipient activity?
9. What sender-screening and bank-account-ownership controls does Iron perform?
10. Are third-party deposits treated differently from first-party deposits for hold,
    review, limits, or liability?
11. What happens when compliance rejects a payment after funds arrive?
12. What happens when the amount is below minimum or above limits?
13. What evidence does Iron provide for a return, reversal, fraud determination, or AML
    rejection?
14. What appeal and support process is available to the recipient and sender?
15. What data may Coin Card retain or disclose when investigating a returned payment?

**Gate 6 pass condition:** post-settlement loss allocation and provider recovery rights
are bounded, insurable/acceptable, and compatible with Coin Card's noncustodial model.

---

## Gate 7 — Economics, limits, support, and partner liability

1. What setup, platform, customer, Virtual Account, transaction, conversion, network,
   banking, return, and support fees apply?
2. Are fees inclusive or deducted from the recipient's stablecoin amount?
3. Can Coin Card configure a partner fee, and under what commercial terms?
4. What minimum monthly volume, annual commitment, reserve, or account fee applies?
5. What per-transfer, daily, monthly, and customer-lifetime limits apply to ACH and Wire?
6. What minimum deposit applies, and what happens below it?
7. Are limits different for Persons, Businesses, third-party payments, or payment
   categories?
8. Is native Polygon USDC enabled for Coin Card in production, and what is the exact
   canonical contract Iron will pay?
9. What banking partners issue the USD account, and what happens during migration,
   reissuance, closure, or partner failure?
10. Are Virtual Account details expected to remain stable for the customer's lifetime?
11. What advance notice and migration evidence does Iron provide when details change?
12. What are the operational SLAs for ACH, Wire, compliance review, conversion, Polygon
    payout, returns, and incident response?
13. What uptime, support severity, escalation, and response commitments are contractual?
14. What reconciliation and polling rate limits apply?
15. What liability caps, exclusions, indemnities, termination rights, and data-protection
    obligations apply to each party?
16. What happens to active, retiring, and in-flight routes when the partner agreement is
    terminated?

**Gate 7 pass condition:** the rail has viable unit economics, operational limits,
support, migration provisions, and liability allocation for Coin Card's intended use.

---

## Cross-cutting evidence and settlement questions

These questions support several gates and must be answered before the validation matrix
can pass:

1. Is `autoramp_id` immutable and never reused across customers or environments?
2. Does the transaction record expose the exact destination account used? If not, does
   Iron contractually guarantee that `autoramp_id` permanently identifies the matched
   conversion rule?
3. Can payouts be batched? If so, does every transaction retain the same payout hash,
   destination amount, and sufficient identity for Coin Card to select the correct token
   transfer log?
4. Can one payout transaction contain multiple transfers to the same wallet and token?
5. Which destination amount must match the Polygon transfer: gross, net, or another
   field?
6. Which Polygon network identity and native-USDC contract are authoritative?
7. At what provider state does Iron consider the payout final?
8. Does Iron ever report `Completed` before the Polygon transaction is successful and
   sufficiently confirmed?
9. What happens if Iron reports `Completed` but the on-chain transaction fails, is
   replaced, reorged, targets the wrong chain/token/wallet, or transfers the wrong amount?
10. What support and correction obligation applies to a settlement mismatch?

---

## Response record template

Use this template for every material answer:

```text
Question ID:
Answer:
Respondent:
Respondent role / authority:
Date:
Applies to entity / region:
Applies to environment / account:
Contract or source:
Account-specific enablement:
Open ambiguity:
Coin Card reviewer:
Authorized exception approver (if applicable):
Exception scope / enforcement / review date (if applicable):
Disposition: PASS | APPROVED_EXCEPTION | FAIL | OPEN
Evidence location:
```
