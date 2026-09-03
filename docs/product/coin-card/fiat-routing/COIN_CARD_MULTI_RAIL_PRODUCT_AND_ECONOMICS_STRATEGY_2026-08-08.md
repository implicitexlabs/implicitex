# Coin Card Multi-Rail Product and Economics Strategy

**Date:** 2026-08-08  
**Status:** EXPLORATORY / INFORMATIVE — NOT AN IMPLEMENTATION AUTHORITY  
**Architecture effect:** NONE  
**Commercial effect:** NONE until adopted by the governing Commercial Specification  
**Related decision record:** `MOONPAY_AND_IRON_PROVIDER_EVALUATION_2026-08-08.md`  
**Unit-economics tracker:** `COIN_CARD_RAIL_UNIT_ECONOMICS_MATRIX_V1.md`

---

## 1. Purpose and authority boundary

This document records the current product thesis, public fee benchmarks, and economic
questions for a future multi-rail Coin Card payment surface. It does not authorize a
MoonPay, Commerce, Iron, sponsored-gas, smart-contract-fee, or other payment route.

It must not be used to change the frozen Iron architecture by implication. Provider
answers may supply evidence, satisfy an existing diligence requirement, support a
bounded governed exception, or reveal a contradiction that formally reopens the
architecture. They do not silently redefine Coin Card.

The existing Commercial Specification remains the commercial authority. A future
transaction charge, annual subscription, provider-fee pass-through, gas subsidy, or
other pricing decision requires an explicit governed amendment and corresponding legal,
privacy, architecture, engineering, accounting, and customer-copy review.

---

## 2. Product thesis: Coin Card as a payment switchboard

Coin Card should remain the stable recipient identity and trusted destination surface.
Payment providers, bank credentials, wallets, chains, and conversion rules are
replaceable routes beneath that identity.

The sender expresses intent:

```text
Pay Maria 25 USD-equivalent
```

An eventual eligibility layer may evaluate:

```text
recipient capabilities
+ sender funding capability
+ amount
+ jurisdiction
+ provider approval and availability
+ KYC / challenge likelihood
+ recipient preference
+ quoted fees
+ settlement time
+ return and fraud risk
= eligible choices and recommendation
```

The primary user-facing choice should describe the funding experience, not require the
sender to understand the infrastructure provider:

```text
Pay from wallet
Pay by card or mobile wallet
Pay by bank
```

The provider and complete fee disclosure remain available in the confirmation surface.
Complexity may be abstracted; material economic and compliance facts must not be hidden.

---

## 3. Candidate lanes

| Lane | Likely fit | Recipient onboarding | Sender friction | Economic shape | Current status |
|---|---|---|---|---|---|
| Direct Polygon USDC | Crypto-native tips and transfers | Coin Card wallet-control verification | Low when sender already has USDC and Polygon gas | Sender network gas; no third-party conversion fee | Existing capability family; exact execution and fee policy governed elsewhere |
| MoonPay Ramps | Convenience-oriented fiat acquisition, generally $20+ | MoonPay partner/account enablement | Payment method plus conditional authentication/KYC/challenges | MoonPay fee, network fee, possible spread, optional ecosystem fee | Direct unrelated-recipient use remains **BLOCKED** pending written approval |
| MoonPay Commerce | Merchant/creator crypto checkout and possible cash-onramp-assisted checkout | Separate Commerce approval | Depends on wallet/cash path | Standard 2% transaction fee; optional swap/off-ramp costs; cash onramp may add separate costs | Separate diligence track; not proven as a direct $3/$5 fiat tip rail |
| Iron Virtual Account | Invoices, salary, contractor, B2B, and larger bank payments | Recipient Iron KYC/KYB and named account | Bank transfer; slower settlement | Conversion/transaction fee, possible bank-rail fee, network fee, and material return/reserve risk | Architecture frozen; evidence acquisition and partner diligence required |

Amount alone must not choose the lane. A $250 payer may prefer Apple Pay, while another
may prefer ACH. The useful distinction is usually convenience-optimized versus
banking-optimized, subject to eligibility and total cost.

---

## 4. Casual-tip finding

MoonPay Ramps does not currently prove a frictionless micro-tip route:

- MoonPay publicly documents a $20-equivalent minimum crypto purchase.
- A new or risk-selected customer may be asked for identity, payment, or security
  information. Coin Card must not promise “no KYC.”
- MoonPay's current U.S. Rails and Express Checkout terms require the purchaser to own
  and control the destination wallet. Direct purchase to an unrelated Coin Card
  recipient therefore remains blocked without explicit product, compliance, and
  contractual approval.
- Buying at least $20 into the sender's own wallet and then sending a $5 portion to the
  recipient is technically a different, two-step experience. It adds a second transfer,
  gas, wallet operation, and abandonment opportunity.

MoonPay Commerce documents a $3 minimum **crypto deposit** on Solana and EVM networks
and says it can offer “Pay with cash” through a debit-card onramp. That does not prove
that the debit-card purchase itself has a $3 minimum, that the cash-purchased crypto may
be delivered directly to an unrelated recipient, or that Coin Card's tips/donations use
case is approved. Commerce must be evaluated as its own product.

The sub-$20 fiat tip remains an explicit product gap until an approved provider flow and
real quote evidence prove otherwise.

---

## 5. Public fee benchmarks as of 2026-08-08

These are orientation values, not Coin Card pricing promises. Actual partner agreements,
region, payment method, order size, customer, asset, network, risk tier, minimum fees,
and live quotes may produce different amounts.

### 5.1 MoonPay Ramps

- MoonPay removed the self-service Ramps dashboard/onboarding subscription paywall on
  2026-04-16. This does not prove that Coin Card has no implementation, support,
  commercial, reserve, or negotiated obligations.
- MoonPay's public consumer page advertises fees from 1% for bank transfers to 4.5% for
  select card purchases.
- MoonPay USA's pricing disclosure says partner-referred MoonPay fees may be up to 4.5%
  and may carry a minimum MoonPay fee of up to $4.50 below a provider-defined threshold.
- A network fee may be charged and varies with network and operational costs.
- A spread may be included in the displayed digital-asset price.
- The customer's bank or card issuer may add its own fee.
- Coin Card may configure a separately disclosed ecosystem fee after Enhanced
  Verification. The dashboard currently labels the self-service field with a 5% maximum;
  a higher fee requires commercial contact.

The minimum-fee possibility matters more than the headline percentage for small orders.
For example, 4.5% of $20 is $0.90, but the public disclosure allows a partner-referred
minimum MoonPay fee of up to $4.50 under the applicable threshold. Only a real executable
quote establishes the actual fee.

### 5.2 MoonPay Commerce

- Free to start on the public self-service offering.
- Standard transaction fee: 2%.
- HelioX transaction fee: 1%.
- Optional swap fee: 0.25%.
- Optional automatic off-ramp fee: 0.50%.
- Custom high-volume pricing may be available; MoonPay states that high-risk platforms
  are subject to a minimum 2% rate.
- Commerce says it covers gas for supported SPL and ERC-20 token deposits.
- Commerce documents typical conversion price impact/slippage of 0.1%–1% when a bridge
  or swap is required.

Commerce gas coverage applies to the documented Commerce deposit flow. It must not be
generalized to Ramps, Iron, a direct Coin Card wallet transfer, or a Coin Card-sponsored
transaction.

### 5.3 Iron Virtual Accounts

- Iron's public fee disclosure places its transaction fee between 0% and 10% and says it
  is typically about 1%.
- A separate bank-rail fee may apply.
- A separate network fee may apply.
- The sender's bank may charge its own outbound fee, especially for Wire.
- Iron/MoonPay support says the authoritative conversion fee depends on partner, region,
  and currency and is shown in the Virtual Account experience.
- The public minimum deposit is generally 1 USD/EUR/GBP equivalent, with possible higher
  effective minimums in some regions after fees.

The broad 0%–10% range is unsuitable for financial planning. Coin Card requires a
binding production pricing schedule at target amounts, including return, investigation,
reserve, minimum-volume, account, support, and exception fees.

### 5.4 Direct Polygon USDC

In an ordinary self-custodial transfer, the sender normally pays Polygon network gas.
Coin Card must query/estimate the live transaction cost and must not promise a permanent
fixed dollar amount.

If Coin Card later introduces gas sponsorship, relaying, account abstraction, or a
contract that pays network costs, those costs become Coin Card variable exposure unless
the transaction explicitly reimburses them. Sponsorship is a separate priced capability,
not an invisible default.

---

## 6. Proposed economic safety rule

This is a candidate commercial invariant, not yet a normative one:

> **Coin Card must not silently subsidize transaction-variable third-party costs. A
> provider fee, network fee, conversion cost, bank-rail fee, return cost, fraud loss,
> reserve cost, or similar transaction-specific expense must be borne by the designated
> transacting party, deducted transparently from settlement, or funded by an explicitly
> priced and budgeted Coin Card service.**

Every enabled route must name the responsible party for each cost before launch:

| Cost | Permitted bearer options | Default planning assumption |
|---|---|---|
| Provider processing/conversion | Payer, recipient deduction, explicitly priced Coin Card service | Not Coin Card |
| Network gas | Sender, provider quote, explicitly priced Coin Card sponsorship | Not Coin Card |
| Sender bank/card fee | Sender | Sender |
| Coin Card ecosystem/service fee | Payer or recipient under explicit governed terms | Zero until approved |
| ACH return/fraud loss | Contractually assigned and accepted party | Unresolved; launch blocker |
| Provider reserve/prefunding | Coin Card only after explicit capital approval | No assumed exposure |
| Refund/support/exception cost | Explicit commercial and operating policy | Unresolved |

Any unexpected non-zero `coin_card_variable_cost` is a failed economics test until the
cost is removed, passed through transparently, or covered by an approved subsidy budget.

---

## 7. Customer amount promise

Two economically distinct promises must remain explicit:

```text
Payer spends 25 USD
  → fees may reduce recipient settlement
```

```text
Maria receives 25 USDC
  → quote determines payer total
```

For tips and invoices, the second promise is generally clearer:

```text
Maria receives    25.00 USDC
Provider costs     2.17 USD
Coin Card          0.00 USD
Total             27.17 USD
```

Amounts above are illustrative only. The interface may simplify presentation but must
show all provider-required quote facts and identify who receives each fee. A provider
fee must not be presented as Coin Card revenue.

---

## 8. Monetization remains a policy decision

The following capabilities should be preserved without assuming they are active:

- existing smart-contract fee capability;
- annual Coin Card subscription;
- MoonPay ecosystem fee;
- flat transaction fee;
- percentage transaction fee;
- premium fiat-receiving capability;
- business verification, reporting, API, or support tiers;
- explicit promotional subsidy.

The 1% contract capability is not itself a business model. It may be retained and
disabled by policy until a governed pricing decision activates it for an eligible route.

A low annual subscription may fund shared fixed costs, but subscription revenue must not
be used to conceal negative transaction margin. Fixed revenue and route-variable
solvency are measured separately.

The initial MoonPay experiment should default to no Coin Card ecosystem fee unless the
Commercial Specification is amended. The experiment should measure provider fees,
completion, KYC/challenge incidence, abandonment, support burden, and recipient outcome
before testing Coin Card monetization.

---

## 9. Required unit-economics evidence

For each provider, funding method, jurisdiction, and supported amount, record:

```text
payer_total
recipient_net
provider_fee
provider_minimum_fee
network_fee
spread_or_price_impact
bank_or_card_fee_if_observable
coin_card_fee
coin_card_variable_cost
coin_card_revenue
return_or_reversal_exposure
reserve_or_prefunding_exposure
gross_margin
quote_expiry
KYC_or_challenge_result
completion_result
```

Test at least:

```text
$5, $10, $20, $25, $50, $100,
$500, $1,000, $5,000, $10,000, $25,000
```

Not every lane must support every amount. Unsupported combinations should be recorded as
`INELIGIBLE`, not forced into an economically or contractually unsuitable route.

---

## 10. Rail isolation and blast-radius rule

Each provider is a separate trust boundary. A provider must not gain authority to alter:

- Coin Card identity;
- the verified recipient wallet route;
- registry or lifecycle authority;
- Coin Card signing keys;
- unrelated provider routes;
- evidence generated by another route.

Provider capability and availability should eventually be controlled as data rather than
hard-coded product behavior. Every rail needs an independently operable kill switch.

```text
MOONPAY_RAMP = DISABLED
```

must remove the MoonPay option without invalidating Coin Card identity, direct wallet
payment, or an unaffected Iron route. Provider compromise should degrade to “that route
is unavailable,” not “the recipient identity can be redirected.”

This security direction is informative until adopted by the applicable normative
architecture and engineering contracts.

---

## 11. Recommended validation sequence

1. Obtain written product/compliance determination for MoonPay Ramps direct unrelated
   recipient payments. A rejection preserves the existing blocked decision.
2. Ask whether MoonPay Commerce expressly permits Coin Card creator support, tips,
   donations, invoices, and third-party recipient checkout; establish the customer,
   merchant, and destination-wallet roles.
3. Obtain binding partner schedules for Ramps, Commerce, and Iron, including minimum fees,
   reserves, returns, chargebacks, minimum volumes, and fixed commitments.
4. Populate the unit-economics matrix with real quotes without adding a Coin Card fee.
5. Run moderated conversion tests by amount and funding intent. Measure identity/KYC
   prompts, challenge incidence, completion, time, errors, support needs, and drop-off.
6. Define eligibility and recommendation policy only from approved, observed results.
7. Propose pricing only after route costs and user value are known.
8. Amend the Commercial Specification and downstream authorities before implementation.

---

## 12. Sources checked 2026-08-08

- MoonPay product portfolio: https://support.moonpay.com/en/articles/694901-the-moonpay-product-portfolio-for-partners
- Ramps partner pricing and removed paywall: https://support.moonpay.com/en/articles/694907-partner-pricing-fees-and-the-removed-paywall
- Ramps asset/fee configuration: https://support.moonpay.com/en/articles/694421-configuring-your-widget-assets-fees-and-theming
- Ramps payment methods, timing, and $20 minimum: https://support.moonpay.com/en/articles/389117-payment-methods-settlement-times-and-limits
- MoonPay USA pricing disclosure: https://www.moonpay.com/legal/pricing_disclosure
- MoonPay public buy-fee overview: https://www.moonpay.com/buy
- MoonPay U.S. Rails terms: https://www.moonpay.com/de/legal/terms_of_use_usa
- MoonPay Express Checkout terms: https://www.moonpay.com/legal/terms_of_use_express_checkout
- MoonPay Commerce FAQ and pricing: https://support.moonpay.com/en/articles/466267-moonpay-commerce-faqs
- MoonPay Commerce deposits, minimums, gas, and slippage: https://support.moonpay.com/en/articles/545759-deposit-crypto-with-moonpay-commerce
- Iron fee disclosure: https://iron.xyz/iron-fee-disclosures
- Iron Virtual Account timing, fees, and limits: https://support.moonpay.com/en/articles/727279-virtual-accounts-processing-times-fees-and-limits

