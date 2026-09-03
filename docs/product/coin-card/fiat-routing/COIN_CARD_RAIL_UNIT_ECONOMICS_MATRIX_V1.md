# Coin Card Rail Unit-Economics Matrix V1

**Status:** WORKING EVIDENCE TRACKER — ALL TEST CELLS NOT RUN  
**Created:** 2026-08-08  
**Strategy context:** `COIN_CARD_MULTI_RAIL_PRODUCT_AND_ECONOMICS_STRATEGY_2026-08-08.md`  
**Evidence root:** `../../../operations/evidence/coin-card-rail-unit-economics/`  
**Authority:** NONE; recorded evidence cannot alter frozen architecture or commercial policy by implication

---

## 1. Decision rule

A route/amount/payment-method combination is eligible only when:

1. the use case and role assignment are contractually approved;
2. the provider and asset are available for the partner, sender, recipient, and region;
3. payer total and recipient net are disclosed accurately;
4. every variable cost and financial exposure has an identified bearer;
5. Coin Card has no unexpected variable loss;
6. observed completion and friction meet the approved product threshold;
7. settlement evidence satisfies the applicable route contract.

An unsupported combination is `INELIGIBLE`. A technically successful transaction does
not override a contractual, security, compliance, or economics failure.

---

## 2. Status vocabulary

| Status | Meaning |
|---|---|
| `NOT_RUN` | No retained quote/test evidence |
| `INELIGIBLE` | Provider, amount, region, role, or use case is unsupported |
| `PASS` | Required evidence is retained and all route criteria pass |
| `FAIL` | One or more route criteria fail |
| `APPROVED_SUBSIDY` | Named amount is intentionally paid from a governed, capped subsidy budget |
| `REQUOTE_REQUIRED` | Prior evidence expired or is no longer representative |

`APPROVED_SUBSIDY` is not authority to create a subsidy. It may be used only after the
Commercial Specification and budget authority expressly approve one.

---

## 3. Public benchmark snapshot

| Route | Public fee signal | Minimum signal | Known additions | Planning interpretation |
|---|---|---|---|---|
| Direct Polygon USDC | Live network gas | Network-defined | Relayer/sponsorship only if introduced | Sender pays unless explicit sponsorship is approved |
| MoonPay Ramps | Publicly advertised 1% bank to 4.5% select card; partner-referred MoonPay fee up to 4.5% | $20 crypto purchase; U.S. disclosure permits minimum MoonPay fee up to $4.50 below threshold | Network fee, spread, ecosystem fee, issuer/bank fee | Real executable quote required; percentage alone is misleading for small orders |
| MoonPay Commerce | 2% standard or 1% HelioX | $3 documented crypto deposit on EVM/Solana, not proven cash-purchase minimum | 0.25% swap; 0.50% off-ramp; typical 0.1%–1% conversion impact | Separate merchant/use-case and cash-path approval required |
| Iron Virtual Account | 0%–10%, typically about 1% | Generally $1 deposit | Bank-rail fee, network fee, sender bank fee, returns/reserves | Binding partner schedule and liability terms required |

These values are not forecasts or customer quotes.

---

## 4. Evidence fields for every quote or transaction

| Field | Required content |
|---|---|
| `case_id` | Stable Coin Card test identifier |
| `tested_at` | ISO-8601 time |
| `environment` | Sandbox / approved production |
| `provider_product` | Direct / Ramps / Commerce / Iron |
| `provider_account` | Redacted partner/account identifier |
| `provider_api_version` | Exact requested and served version where available |
| `jurisdiction` | Sender and recipient jurisdiction |
| `use_case` | Tip / creator support / invoice / contractor / salary / goods / other |
| `role_approval_evidence` | Contract/compliance artifact reference |
| `source_method` | Wallet / card / Apple Pay / Google Pay / ACH / Wire / other |
| `source_amount` | Customer-entered source amount and currency |
| `destination_amount_requested` | Recipient amount promise, if used |
| `payer_total` | Total provider says payer owes |
| `recipient_net` | Final expected recipient asset amount |
| `provider_fee` | Amount, currency, and fee label |
| `provider_minimum_fee` | Amount and applicability, if any |
| `network_fee` | Amount, currency, and bearer |
| `spread_or_price_impact` | Explicit amount/percentage or method of calculation |
| `bank_or_card_fee` | Observable issuer/originator fee; otherwise `UNKNOWN_EXTERNAL` |
| `coin_card_fee` | Amount and governed policy reference |
| `coin_card_variable_cost` | All transaction-specific Aden Media Group costs |
| `coin_card_revenue` | Route-specific Coin Card revenue |
| `reserve_exposure` | Required amount/duration or `NONE_PROVEN` |
| `return_or_fraud_exposure` | Contract reference and maximum modeled loss |
| `gross_margin` | `coin_card_revenue - coin_card_variable_cost - allocated_expected_loss` |
| `quote_expiry` | Provider expiry time |
| `identity_friction` | Fields/frames/challenges actually presented |
| `completion_result` | Completed / abandoned / failed and reason |
| `settlement_time` | Measured end-to-end duration |
| `evidence_link` | Repository evidence path |
| `status` | Matrix status vocabulary |
| `reviewer` | Authorized reviewer |
| `notes` | Constraints and anomalies |

---

## 5. Required amount grid

Create one row per eligible provider product, payment method, jurisdiction, and use case.

| Amount | Direct Polygon USDC | MoonPay Ramps card/mobile wallet | MoonPay Commerce | Iron ACH | Iron Wire |
|---:|---|---|---|---|---|
| $5 | `NOT_RUN` | Expected `INELIGIBLE` under public $20 minimum | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` |
| $10 | `NOT_RUN` | Expected `INELIGIBLE` under public $20 minimum | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` |
| $20 | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` |
| $25 | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` |
| $50 | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` |
| $100 | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` |
| $500 | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` |
| $1,000 | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` |
| $5,000 | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` |
| $10,000 | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` |
| $25,000 | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` |

“Expected `INELIGIBLE`” is a public-document expectation, not a completed test result.
The limits/capabilities API and partner configuration remain authoritative.

---

## 6. Friction and conversion measures

For each eligible flow, record:

| Measure | Definition |
|---|---|
| `checkout_started` | Eligible users who enter the provider flow |
| `identity_prompt_rate` | Users shown any identity/KYC request |
| `challenge_rate` | Users shown 3DS, SCA, CVC, wallet, or other challenge |
| `completion_rate` | Completed provider transactions / checkout starts |
| `median_completion_time` | Start to provider transaction creation/completion, as applicable |
| `settlement_verified_rate` | Independently verified settlements / provider completed transactions |
| `support_contact_rate` | Provider-flow support contacts / starts |
| `fee_abandonment_rate` | Exits after fee disclosure / users who saw quote |
| `repeat_payer_rate` | Returning eligible payers over the approved measurement period |

MoonPay experimentation must not advertise “no KYC.” The experiment measures the
actual friction distribution by amount, method, customer state, and jurisdiction.

---

## 7. Aden Media Group exposure register

Every route must answer these before `PASS`:

| Exposure | Required answer |
|---|---|
| Fixed provider subscription/platform minimum | Exact amount, term, and cancellation obligation |
| Integration/certification cost | Internal and provider-charged amount |
| Per-transaction provider cost | Amount/formula and bearer |
| Network/gas cost | Amount/formula, bearer, and cap |
| Chargeback/ACH-return loss | Contractual bearer and recovery mechanism |
| Reserve/prefunding | Formula, duration, release, and maximum capital requirement |
| Refund/failed-payment fee | Amount and bearer |
| Compliance investigation fee | Amount and trigger |
| Support/SLA cost | Plan, response commitment, and escalation cost |
| RPC/reconciliation/monitoring cost | Expected Coin Card variable and fixed cost |
| Ecosystem-fee settlement | Collection, payout timing, refunds, taxes, reporting |
| Provider termination/migration | Exit fees and replacement cost |

The most material Iron exposure may be post-payout ACH return, reserve, or indemnity
risk rather than Polygon gas. The most material small-order Ramps cost may be a minimum
MoonPay fee rather than the displayed percentage. Both require retained contractual and
quote evidence.

---

## 8. Initial pass/fail conditions

| ID | Condition | Pass evidence | Failure |
|---|---|---|---|
| UE01 | No silent subsidy | Every variable cost has approved bearer | Unexpected Coin Card cost |
| UE02 | Recipient promise reconciles | Quote and settlement match displayed promise | Recipient receives less than promised |
| UE03 | Provider fee attribution | Provider fee is identified accurately | Provider fee represented as Coin Card fee or hidden |
| UE04 | Minimum-fee viability | Target small amounts meet approved effective-cost threshold | Minimum fee makes target use uneconomic |
| UE05 | Return/fraud allocation | Binding accepted contract | Undefined or uncapped material exposure |
| UE06 | Reserve viability | Capital requirement approved | Unacceptable or unknown reserve |
| UE07 | No fixed-cost surprise | All fixed commitments recorded and approved | Undisclosed minimum/subscription/implementation fee |
| UE08 | Quote authority | Current executable quote drives display and execution | Hard-coded fee assumptions |
| UE09 | Role/use-case approval | Written product/compliance approval | Technical possibility only |
| UE10 | Kill-switch isolation | Rail can be disabled without identity/other-route impact | Provider failure affects Coin Card identity or unrelated routes |

---

## 9. Evidence storage

Create a dedicated redacted evidence directory before live quote or transaction testing.
Do not commit full bank credentials, card data, customer identity documents, provider
secrets, webhook secrets, raw unredacted KYC artifacts, or private wallet material.

Evidence should include the quote/request correlation ID, redacted response, applicable
terms/pricing version, provider account/environment, reviewer, date, and cryptographic
hash of any sensitive artifact retained outside the repository.
