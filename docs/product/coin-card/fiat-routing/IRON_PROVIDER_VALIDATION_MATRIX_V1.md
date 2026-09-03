# Iron Provider Validation Matrix V1

**Status:** NOT RUN
**Architecture authority:**
`../COIN_CARD_IRON_FIAT_ROUTING_ARCHITECTURE_V1.md`
**Master diligence authority:** `IRON_COIN_CARD_FIAT_RAIL_DILIGENCE_MASTER_V1.md`
**Diligence questions:** `IRON_PROVIDER_DILIGENCE_QUESTIONNAIRE_V1.md`
**Created:** 2026-08-08

Retained run evidence belongs under
`../../../operations/evidence/coin-card-iron-fiat-routing/` or in the approved restricted
evidence system referenced from that directory.

---

## Rules

- `PASS` requires retained, reproducible evidence.
- `APPROVED_EXCEPTION` requires a bounded formal exception, named decision-maker,
  rationale, expiration/review date, and technical enforcement where applicable.
- Any `FAIL` in a launch-blocking row prevents production launch.
- Sandbox proves integration mechanics, not production entitlement or commercial
  approval.
- Production tests involving real money require prior written Iron approval, test limits,
  named operators, and a rollback/incident procedure.
- No production test may use unrelated third-party funds until the applicable payment
  category and loss allocation are contractually approved.

Allowed statuses:

```text
NOT_RUN | IN_PROGRESS | PASS | APPROVED_EXCEPTION | FAIL | NOT_APPLICABLE
```

`CONDITIONAL PASS` is a final launch disposition defined by the master document. It is
not a tracker-row status.

Provider answers populate this tracker; they do not amend architecture. Any answer that
conflicts with a frozen invariant must be recorded as a contradiction and escalated to
the formal architecture reopen process rather than accommodated through an incidental
documentation edit.

---

## Phase 1 — no-code diligence queue

| Order | Focus | Master rows | Accountable disciplines | Status | Evidence Link | Reviewed Date | Notes |
|---:|---|---|---|---|---|---|---|
| 1 | Product and contractual permission | V01, V02, V38, V39 | Legal / Product / Security | NOT_RUN | — | — | Fail fast before deeper diligence |
| 2 | Liability and economics | V33–V37 | Legal / Finance / Risk / Product | NOT_RUN | — | — | Establish post-settlement exposure and viability |
| 3 | Control-plane safety | V13–V15, V42 | Security / Operations | NOT_RUN | — | — | Inadequate RBAC/auditability blocks launch |
| 4 | Provider behavioral guarantees | V04–V10 | Engineering / Product / Operations | NOT_RUN | — | — | Confirm persistent VA, PBR, disablement, and stale-route behavior |
| 5 | Production API contract | V07, V08, V18–V20, V40, V41 | Engineering / Security | NOT_RUN | — | — | Pin commitments before integration code |

Phase 1 changes only answers, evidence links, dates, reviewers, and dispositions. It does
not authorize integration implementation or production-money tests.

---

## Master gate tracker

Pass/fail criteria for V01–V45 are normative in
`IRON_COIN_CARD_FIAT_RAIL_DILIGENCE_MASTER_V1.md`. This table is their auditable working
disposition. `Owner` names the accountable discipline; a named individual must be added
before work begins.

| ID | Gate / test | Owner | Status | Evidence Link | Tested Date | API Version | Environment | Notes |
|---|---|---|---|---|---|---|---|---|
| V01 | Third-party deposits permitted | Legal / Product | NOT_RUN | — | — | — | Contract diligence | — |
| V02 | Commercial-use categories | Legal / Product | NOT_RUN | — | — | — | Contract diligence | — |
| V03 | Polygon native USDC supported | Engineering / Security | NOT_RUN | — | — | — | Production configuration | — |
| V04 | Persistent Virtual Account | Engineering / Product | NOT_RUN | — | — | — | Sandbox / Production | — |
| V05 | Multiple PBR Autoramps | Engineering / Product | NOT_RUN | — | — | — | Sandbox / Production | — |
| V06 | PBR fail-closed | Engineering / Product / Operations | NOT_RUN | — | — | — | Sandbox / Approved production | — |
| V07 | `autoramp_id` correlation | Engineering | NOT_RUN | — | — | — | Sandbox / Production | — |
| V08 | Exact PBR visibility | Engineering | NOT_RUN | — | — | — | Sandbox / Production | — |
| V09 | Disabled Autoramp behavior | Engineering / Operations | NOT_RUN | — | — | — | Sandbox / Approved production | — |
| V10 | In-flight disable behavior | Engineering / Operations | NOT_RUN | — | — | — | Approved test | — |
| V11 | ACH reference preservation | Engineering / Product / Operations | NOT_RUN | — | — | — | Approved production | — |
| V12 | Wire reference preservation | Engineering / Product / Operations | NOT_RUN | — | — | — | Approved production | — |
| V13 | Provider RBAC | Security / Operations | NOT_RUN | — | — | — | Production diligence | — |
| V14 | Break-glass controls | Security / Operations | NOT_RUN | — | — | — | Production diligence | — |
| V15 | Configuration audit trail | Security / Operations | NOT_RUN | — | — | — | Production diligence | — |
| V16 | Execution-fingerprint readback | Engineering / Security | NOT_RUN | — | — | — | Sandbox / Production | — |
| V17 | Drift suspension | Engineering / Security | NOT_RUN | — | — | — | Sandbox / Tabletop | — |
| V18 | API version pinning | Engineering | NOT_RUN | — | — | — | Sandbox / Production | — |
| V19 | Served-version handling | Engineering | NOT_RUN | — | — | — | Sandbox / Production | — |
| V20 | Idempotency replay | Engineering | NOT_RUN | — | — | — | Sandbox | — |
| V21 | Webhook HMAC | Engineering / Security | NOT_RUN | — | — | — | Sandbox | — |
| V22 | Webhook duplicates | Engineering | NOT_RUN | — | — | — | Sandbox | — |
| V23 | Out-of-order webhooks | Engineering | NOT_RUN | — | — | — | Sandbox | — |
| V24 | API reconciliation | Engineering | NOT_RUN | — | — | — | Sandbox | — |
| V25 | Iron completion boundary | Engineering / Product | NOT_RUN | — | — | — | Sandbox / Approved production | — |
| V26 | Polygon payout hash | Engineering / Security | NOT_RUN | — | — | — | Approved Polygon test | — |
| V27 | Polygon receipt | Engineering / Security | NOT_RUN | — | — | — | Approved Polygon test | — |
| V28 | Native-USDC emitter | Engineering / Security | NOT_RUN | — | — | — | Approved Polygon test | — |
| V29 | Recipient verification | Engineering / Security | NOT_RUN | — | — | — | Approved Polygon test | — |
| V30 | Amount verification | Engineering / Security | NOT_RUN | — | — | — | Approved Polygon test | — |
| V31 | Finality | Engineering / Security | NOT_RUN | — | — | — | Approved Polygon test | — |
| V32 | Settlement mismatch handling | Engineering / Security | NOT_RUN | — | — | — | Local fault injection | — |
| V33 | ACH-return liability | Legal / Finance / Risk | NOT_RUN | — | — | — | Contract diligence | — |
| V34 | Post-payout fraud | Legal / Finance / Risk | NOT_RUN | — | — | — | Contract diligence | — |
| V35 | Reserve requirements | Legal / Finance / Risk | NOT_RUN | — | — | — | Commercial diligence | — |
| V36 | Partner pricing | Finance / Product | NOT_RUN | — | — | — | Commercial diligence | — |
| V37 | Transaction limits | Product / Finance | NOT_RUN | — | — | — | Production configuration | — |
| V38 | Public Pay-by-bank UX | Legal / Product / Security | NOT_RUN | — | — | — | Product/compliance diligence | — |
| V39 | Legal-name disclosure | Product / Legal | NOT_RUN | — | — | — | UX/compliance review | — |
| V40 | Production schema parity | Engineering | NOT_RUN | — | — | — | Production validation | — |
| V41 | Customer-creation version | Engineering | NOT_RUN | — | — | — | Sandbox / Production | — |
| V42 | Autoramp immutability | Security / Operations | NOT_RUN | — | — | — | Production control test | — |
| V43 | Route-replacement atomicity | Engineering | NOT_RUN | — | — | — | Local / Sandbox failure test | — |
| V44 | `RETIRING` behavior | Engineering / Operations | NOT_RUN | — | — | — | Sandbox / Approved production | — |
| V45 | Evidence completeness | Engineering / Security / Risk | NOT_RUN | — | — | — | End-to-end approved test | — |

---

## Detailed validation execution tracker

| ID | Gate | Owner | Status | Evidence Link | Tested Date | API Version | Environment | Test or evidence | Pass condition | Required retained evidence | Notes |
|---|---:|---|---|---|---|---|---|---|---|---|---|
| DIL-01 | 1 | Security / Operations | NOT_RUN | — | — | — | Production diligence | Review Partner Dashboard roles | Ordinary operators cannot edit published Autoramps | Role matrix, screenshots/export, Iron confirmation | — |
| DIL-02 | 1 | Security / Operations | NOT_RUN | — | — | — | Production diligence | Review API credential scopes | Read/reconcile authority is separable from mutation authority | Scope documentation and test credentials | — |
| DIL-03 | 1 | Security / Operations | NOT_RUN | — | — | — | Production diligence | Exercise break-glass workflow | Privileged access is normally disabled, strongly authenticated, approved, and audited | Procedure, access logs, approval evidence | — |
| DIL-04 | 1 | Security / Operations | NOT_RUN | — | — | — | Production diligence | Review Autoramp audit trail | Every dashboard, API, support, and provider change identifies actor and before/after state | Audit export and written completeness guarantee | — |
| DIL-05 | 1 | Security / Operations | NOT_RUN | — | — | — | Sandbox/production | Observe edit event coverage | An edit attempt immediately alerts Coin Card; gaps are documented and polled | Webhook payloads, polling logs, timing record | — |
| SBX-01 | 1,4 | Engineering / Security | NOT_RUN | — | — | — | Sandbox | Create PBR Autoramp using pinned API version | Request succeeds under selected dated contract and response version matches | Sanitized request/response and headers | — |
| SBX-02 | 1,4 | Engineering / Security | NOT_RUN | — | — | — | Sandbox | Read Autoramp after approval | Authoritative normalized fingerprint exactly matches intended snapshot | Expected object, returned object, canonical bytes, hash | — |
| SBX-03 | 1 | Engineering / Security | NOT_RUN | — | — | — | Sandbox | Create deliberate dashboard/API drift on nonproduction route | Reconciler detects drift, withdraws instructions, and enters `SUSPENDED` | Audit event, poll/webhook, state transition, alert | — |
| SBX-04 | 1 | Engineering / Security | NOT_RUN | — | — | — | Sandbox | Add irrelevant provider metadata if supported | Non-semantic change is recorded without false suspension | Before/after objects and classifier result | — |
| SBX-05 | 1 | Engineering / Security | NOT_RUN | — | — | — | Sandbox | Change an unclassified field | Unknown drift fails closed | Reconciliation and suspension evidence | — |
| PBR-01 | 3 | Engineering / Product | NOT_RUN | — | — | — | Sandbox | Create two PBR Autoramps for one customer | Same Virtual Account may be shared; references and `autoramp_id` values are distinct | Autoramp resources and fingerprints | — |
| PBR-02 | 3 | Engineering / Product | NOT_RUN | — | — | — | Sandbox | Deposit with current valid reference | Transaction correlates to the expected `autoramp_id` | Webhook, fetched transaction, route lookup | — |
| PBR-03 | 3 | Engineering / Product | NOT_RUN | — | — | — | Sandbox | Deposit with prior valid draining reference | Transaction correlates only to prior immutable route | Transaction and route-version evidence | — |
| PBR-04 | 2,3 | Engineering / Product | NOT_RUN | — | — | — | Sandbox | Deposit without reference | Deposit is returned and never ambiguously converted | Return lifecycle, transaction/webhook evidence | — |
| PBR-05 | 2,3 | Engineering / Product | NOT_RUN | — | — | — | Sandbox | Deposit with invalid/truncated reference | Deposit is returned and never ambiguously converted | Return lifecycle, transaction/webhook evidence | — |
| PBR-06 | 2,3 | Engineering / Product | NOT_RUN | — | — | — | Sandbox | Deposit with another customer's reference | No cross-customer routing occurs | Rejection/return and security review | — |
| PBR-07 | 3 | Engineering / Product | NOT_RUN | — | — | — | Sandbox/API | Inspect received-reference fields | Exact relationship among PBR reference, ACH reference, and Wire message is established | Schema citation and actual responses | — |
| ACH-01 | 3 | Engineering / Product / Operations | NOT_RUN | — | — | — | Approved production pilot | ACH from first supported originator | Exact reference survives and routes to intended Autoramp | Bank receipt, Iron record, route correlation | — |
| ACH-02 | 3 | Engineering / Product / Operations | NOT_RUN | — | — | — | Approved production pilot | ACH from second materially different originator | Exact reference survives and routes to intended Autoramp | Bank receipt, Iron record, route correlation | — |
| ACH-03 | 3 | Engineering / Product / Operations | NOT_RUN | — | — | — | Approved production pilot | ACH UI/reference usability review | Payer can identify and correctly populate required field | Screen recording/screenshots and observer notes | — |
| WIRE-01 | 3 | Engineering / Product / Operations | NOT_RUN | — | — | — | Approved production pilot | Wire from supported originator | Exact reference survives and routes to intended Autoramp | Wire receipt, Iron record, route correlation | — |
| WIRE-02 | 3 | Engineering / Product / Operations | NOT_RUN | — | — | — | Approved production pilot | Wire UI/reference usability review | Payer can identify and correctly populate required field | Screen recording/screenshots and observer notes | — |
| DIS-01 | 2 | Engineering / Operations | NOT_RUN | — | — | — | Sandbox | Deposit referencing disabled Autoramp | Behavior exactly matches written Iron commitment; no wrong destination | Transaction, webhook, return, timing evidence | — |
| DIS-02 | 2 | Engineering / Operations | NOT_RUN | — | — | — | Sandbox | Deposit referencing cancelled Autoramp | Behavior exactly matches written Iron commitment; no wrong destination | Transaction, webhook, return, timing evidence | — |
| DIS-03 | 2 | Engineering / Operations | NOT_RUN | — | — | — | Sandbox | Re-enable disabled Autoramp if supported | Reference and route identity behavior is documented and deterministic | Before/after resources and transaction test | — |
| API-01 | 4 | Engineering | NOT_RUN | — | — | — | Sandbox | Send selected `X-API-Version` on every `/api` request | Served header equals requested version | HTTP capture | — |
| API-02 | 4 | Engineering | NOT_RUN | — | — | — | Sandbox | Retry an idempotent POST | Stored response is identical; absent version header is accepted only through stored idempotency evidence | Original/replay captures and idempotency record | — |
| API-03 | 4 | Engineering | NOT_RUN | — | — | — | Sandbox | Send unknown and malformed versions | Iron rejects rather than silently falling back | HTTP captures | — |
| API-04 | 4 | Engineering | NOT_RUN | — | — | — | Sandbox/production specs | Diff dated OpenAPI documents | All required production operations and shapes are present; environment-only differences are understood | Specs, generated-client hashes, diff review | — |
| API-05 | 4 | Engineering | NOT_RUN | — | — | — | Production approved read test | Read production Autoramp and transaction shapes | Production returns tested required fields under pinned version | Sanitized responses and schema validation | — |
| API-06 | 4 | Engineering | NOT_RUN | — | — | — | Sandbox | Exercise customer behavioral version | Onboarding sequence matches version pinned at customer creation | Customer events/status timeline | — |
| WH-01 | 4 | Engineering / Security | NOT_RUN | — | — | — | Sandbox | Verify valid webhook | HMAC/raw-body/timestamp validation succeeds | Fixture and handler logs | — |
| WH-02 | 4 | Engineering / Security | NOT_RUN | — | — | — | Sandbox | Tamper body/signature/timestamp | Invalid or stale deliveries are rejected | Negative-test results | — |
| WH-03 | 4 | Engineering / Security | NOT_RUN | — | — | — | Sandbox | Redeliver same `webhook-id` | Transport side effects occur once | Delivery records and idempotency proof | — |
| WH-04 | 4 | Engineering / Security | NOT_RUN | — | — | — | Sandbox | Deliver status events out of order | Authoritative fetch produces valid forward-only semantic state | Event sequence and state log | — |
| WH-05 | 4 | Engineering / Security | NOT_RUN | — | — | — | Sandbox | Pause or fail webhook intake | Polling reconciliation recovers all transaction changes | Failure window, poll results, recovered states | — |
| TX-01 | 4 | Engineering | NOT_RUN | — | — | — | Sandbox | Fetch webhook transaction by ID | Transaction resolves directly to expected `autoramp_id` | Webhook and transaction response | — |
| TX-02 | 4 | Engineering | NOT_RUN | — | — | — | Sandbox | Validate transaction amount/fee fields | Source, destination, fees, third-party flag, and tracking parse without ambiguity | Schema validation and normalized record | — |
| TX-03 | 4 | Engineering | NOT_RUN | — | — | — | Sandbox/approved pilot | Validate payout hash correlation | Provider transaction exposes the Polygon payout hash used for settlement proof | Transaction response and chain lookup | — |
| SET-01 | 4 | Engineering / Security | NOT_RUN | — | — | — | Approved Polygon test | Verify successful native-USDC payout | Chain, receipt, token contract, recipient, atomic amount, and finality match snapshot | RPC responses, receipt, decoded log, verifier output | — |
| SET-02 | 4 | Engineering / Security | NOT_RUN | — | — | — | Local deterministic fixture | Wrong-chain payout fixture | Verifier returns `SETTLEMENT_MISMATCH` | Fixture and test output | — |
| SET-03 | 4 | Engineering / Security | NOT_RUN | — | — | — | Local deterministic fixture | Wrong-token-contract fixture | Verifier returns `SETTLEMENT_MISMATCH` | Fixture and test output | — |
| SET-04 | 4 | Engineering / Security | NOT_RUN | — | — | — | Local deterministic fixture | Wrong-recipient fixture | Verifier returns `SETTLEMENT_MISMATCH` | Fixture and test output | — |
| SET-05 | 4 | Engineering / Security | NOT_RUN | — | — | — | Local deterministic fixture | Wrong-amount fixture | Verifier returns `SETTLEMENT_MISMATCH` | Fixture and test output | — |
| SET-06 | 4 | Engineering / Security | NOT_RUN | — | — | — | Local deterministic fixture | Failed receipt fixture | Verifier returns `SETTLEMENT_MISMATCH` | Fixture and test output | — |
| SET-07 | 4 | Engineering / Security | NOT_RUN | — | — | — | Local/approved test | Batched payout with multiple Transfer logs | Verifier selects exactly the log matching contract, recipient, and amount | Receipt fixture/transaction and decoded selection | — |
| SET-08 | 4 | Engineering / Security | NOT_RUN | — | — | — | Local deterministic fixture | Duplicate matching logs | Ambiguity fails closed unless an authorized discriminator exists | Fixture and verifier output | — |
| SET-09 | 4 | Engineering / Security | NOT_RUN | — | — | — | Approved Polygon test | Temporary RPC disagreement or reorg simulation | No final delivery claim until finality policy passes | Provider traces and verifier state timeline | — |
| PRIV-01 | 5 | Product / Legal / Security | NOT_RUN | — | — | — | Product/compliance | Review legal beneficiary-name surface | Legal-name disclosure occurs only at approved bank-payment boundary with clear notice | Approved screens/copy and Iron approval | — |
| PRIV-02 | 5 | Product / Legal / Security | NOT_RUN | — | — | — | Security/product | Test payment-instruction exposure | Raw bank details are not indexed, logged, cached publicly, or leaked to analytics | Security review and crawler/cache tests | — |
| COM-01 | 5 | Legal / Product | NOT_RUN | — | — | — | Contract | Approve intended payment categories | Executed terms explicitly cover each launched category | Executed agreement/addendum | — |
| COM-02 | 5 | Legal / Product | NOT_RUN | — | — | — | Contract/product | Approve public Pay-by-bank presentation | Iron approves when and how credentials may be shown | Written approval and approved UX | — |
| RISK-01 | 6 | Legal / Finance / Risk | NOT_RUN | — | — | — | Contract | Map ACH return/reversal lifecycle | Finality, holds, recovery rights, and loss owner are explicit | Contract memo and counsel/finance approval | — |
| RISK-02 | 6 | Legal / Finance / Risk | NOT_RUN | — | — | — | Sandbox/approved test | Exercise compliance rejection/return | Funds return predictably; Coin Card receives sufficient evidence | Transaction timeline and return proof | — |
| RISK-03 | 6 | Legal / Finance / Risk | NOT_RUN | — | — | — | Contract | Review reserves/netting/recovery | Exposure is bounded and compatible with noncustodial design | Contract terms and risk signoff | — |
| ECON-01 | 7 | Finance / Product | NOT_RUN | — | — | — | Commercial | Price representative transfers | Unit economics pass at target ACH/Wire amounts and volumes | Quote/fee schedule and model | — |
| ECON-02 | 7 | Finance / Product | NOT_RUN | — | — | — | Commercial | Confirm limits and minimums | Target customers and transaction sizes fit enabled limits | Account-specific limit schedule | — |
| ECON-03 | 7 | Finance / Product | NOT_RUN | — | — | — | Contract | Review banking-partner migration | Notice, credential rotation, draining, and customer communications are workable | Contract/process and tabletop record | — |
| OPS-01 | 7 | Operations / Security | NOT_RUN | — | — | — | Contract/operations | Review support and incident SLAs | Severity, escalation, reconciliation, and correction SLAs meet risk needs | SLA and escalation roster | — |
| OPS-02 | 7 | Operations / Security | NOT_RUN | — | — | — | Tabletop | Simulate provider configuration drift with in-flight ACH | Instructions suspend; in-flight exposure is found, escalated, and resolved | Tabletop timeline, decisions, action log | — |
| OPS-03 | 7 | Operations / Security | NOT_RUN | — | — | — | Tabletop | Simulate provider termination or bank-partner failure | Active/retiring routes are withdrawn and funds/instructions handled safely | Exit-plan evidence | — |

---

## Launch-gate summary

| Gate | Owner | Required rows | Status | Blocking evidence location |
|---:|---|---|---|---|
| 1. RBAC and audit | Security / Operations | DIL-01–05, SBX-01–05 | NOT_RUN | — |
| 2. Disabled routes | Engineering / Operations | DIS-01–03, PBR-04–06 | NOT_RUN | — |
| 3. PBR bank reliability | Engineering / Product | PBR-01–07, ACH-01–03, WIRE-01–02 | NOT_RUN | — |
| 4. Production API/evidence | Engineering / Security | API-01–06, WH-01–05, TX-01–03, SET-01–09 | NOT_RUN | — |
| 5. Approved use | Legal / Product | PRIV-01–02, COM-01–02 | NOT_RUN | — |
| 6. Returns and fraud | Legal / Finance / Risk | RISK-01–03 | NOT_RUN | — |
| 7. Economics and liability | Finance / Legal / Operations | ECON-01–03, OPS-01–03 | NOT_RUN | — |

Production launch requires every applicable underlying row to be `PASS` or an authorized
`APPROVED_EXCEPTION`. The final decision follows the master diligence authority.

---

## Final launch decision record

```text
Decision: NOT_RUN | PASS | CONDITIONAL_PASS | FAIL
Decision scope:
Authorized decision-maker(s):
Decision date:
Commercial Specification authorization:
Applicable approved exceptions:
Technically enforced limitations:
Evidence-package link:
Open post-launch monitoring obligations:
Next mandatory review date:
Notes:
```

No person may record `PASS` or `CONDITIONAL_PASS` until every applicable master and
detailed tracker row has an auditable disposition under the master decision standard.

---

## Evidence-run record

Create one record per execution using:

```text
Run ID:
Matrix row:
Owner:
Environment:
Date/time UTC:
Operators:
Iron account/customer/Autoramp IDs (redacted as required):
Pinned API version:
Tested date:
Procedure revision:
Expected result:
Actual result:
Status:
Evidence link:
Raw evidence location:
Normalized evidence hash:
Issue/incident link:
Notes:
Reviewer:
Review date:
```
