# MoonPay and Iron Fiat Rail Evaluation

**Date:** 2026-08-08
**Status:** Decision record; informative except where incorporated by the frozen
architecture
**Frozen architecture:** `../COIN_CARD_IRON_FIAT_ROUTING_ARCHITECTURE_V1.md`

---

## Executive decision

Two materially different provider tracks were evaluated:

| Track | Intended flow | Decision |
|---|---|---|
| A — MoonPay Platform Buy | Payer's card/wallet → MoonPay purchase → unrelated Coin Card holder's wallet | **BLOCKED** unless MoonPay supplies explicit product, compliance, and contractual approval for third-party destinations without a false purchaser wallet-ownership representation |
| B — Iron Virtual Accounts | Third-party payer's bank → recipient's named Virtual Account → automatic conversion → recipient's verified wallet | **CREDIBLE RAIL CANDIDATE**; architecture frozen, production gated by provider diligence and empirical validation |

The decisive difference is role assignment. In Track A, the purchaser is asked to buy
crypto to a wallet controlled by somebody else. In Track B, the recipient is the Iron
customer and verified wallet controller; the third party supplies fiat to the
recipient's receiving account.

---

## Track A — MoonPay Platform Buy

### Technically attractive findings

MoonPay Platform supports a substantially Coin Card-native experience:

- hosted MoonPay connection and KYC;
- authenticated/connected customers;
- executable fiat-to-crypto quotes containing a destination wallet;
- network-specific CeFi asset identifiers and network/contract metadata from the Assets
  endpoint;
- card, Apple Pay, and Google Pay availability subject to customer/account/region;
- a Buy Button that owns sensitive payment selection and challenges;
- headless Buy using the same general orchestration contract;
- MoonPay-hosted Add Card and Challenge frames so Coin Card does not collect card,
  identity-document, 3DS, CVC, SCA, wallet-ownership, or similar sensitive inputs;
- an `externalTransactionId` suitable for correlating a Coin Card payment intent;
- canonical transaction resources containing source, destination, fees, wallet, customer,
  payment method, and provider transaction status.

The proposed implementation path had been:

```text
V1
Coin Card amount and recipient context
  → hosted MoonPay connection/KYC
  → executable quote to the resolved wallet
  → MoonPay Buy Button
  → Challenge frame when required
  → poll transaction until completed
  → reconcile quote and completed transaction

V2
same state machine
  → replace Buy Button with headless Buy
```

The Buy Button and headless Buy could share a Coin Card payment-intent state machine.
Frame `buttonPressed` would mean only user interaction, never authorization or payment.
Frame `complete` could still carry a pending transaction and would mean only that the
interactive flow completed. Final provider completion would require polling the
canonical transaction resource. Platform Buy Button webhooks were documented as not yet
available, making polling the supported baseline at the time of evaluation.

### Quote and fee model

MoonPay must be treated as a quote-driven execution rail, not as a fixed-fee processor.
A current executable quote supplies source and destination amounts, wallet, fees,
expiry, limits, and disclosures.

Two different customer promises were identified:

```text
Spend $30
  → inclusive fees may make recipient receive less than 30 USDC

Recipient receives 30 USDC
  → quote determines total USD payer cost
```

MoonPay's fee model can represent network, MoonPay, ecosystem/platform, and other
applicable fees. The existence of an ecosystem fee in the response model was not treated
as proof that Coin Card could configure an arbitrary fee without commercial enablement.

The technical asset gate was refined from “can MoonPay distinguish Polygon USDC?” to:

> Retrieve the authenticated Platform asset list, identify the exact native Polygon USDC
> identifier/contract/network, confirm account availability, and obtain an executable USD
> quote to an intended Polygon address.

### Guest checkout boundary

Guest checkout was not treated as general anonymous card checkout. At the time of
evaluation, MoonPay documented it as a special Apple Pay-oriented path, partner-enabled,
for eligible U.S. customers excluding New York and Washington. Coin Card would supply
partner-verified email and phone information and accept responsibility for its accuracy.

For connected MoonPay customers, the broader card/Apple Pay/Google Pay paths remained
available subject to current capability discovery.

### Compliance and contractual blocker

MoonPay's published U.S. terms and Express Checkout terms require the purchaser to
represent that the purchaser owns and controls the destination wallet. This remains
material even when a partner supplies the wallet address.

The blocked role assignment is:

```text
Payer: Antoine
Card: Antoine's Visa

MoonPay purchaser: Antoine
Destination wallet controller: Maria
```

Antoine cannot truthfully represent that he owns and controls Maria's wallet. A small
transaction passing without a wallet-ownership challenge would not prove authorization;
technical enforcement may be conditional while the contractual representation remains.

The Track A gate is therefore:

> Obtain written MoonPay product and compliance approval for unrelated third-party
> recipient purchases, identify the governing service and terms, and confirm that the
> approved customer flow does not require the payer to falsely represent ownership or
> control of the recipient wallet.

A general salesperson assurance or a successful test transaction is insufficient.

### Track A fallback

The conventionally compatible flow would be:

```text
Antoine USD
  → MoonPay
  → USDC to Antoine's wallet
  → separate Antoine wallet transfer
  → Maria's Coin Card wallet
```

This preserves the purchaser-wallet ownership model but creates a worse two-transaction
experience. Coin Card should not contort the product around that flow without a separate
product decision.

---

## Track B — Iron Virtual Accounts

### Product-fit findings

Iron documents API-driven customer onboarding, KYC/KYB, wallet registration, Autoramp
creation, Virtual Account credentials, transactions, and webhooks. Its materials state
that Virtual Accounts:

- receive fiat from the customer's own bank or a third party;
- are open to senders without sender preapproval, subject to compliance processing;
- are issued in the customer's verified legal name;
- automatically convert incoming fiat to the configured stablecoin;
- deliver the result to the customer's registered self-custodial wallet;
- support freelancer and third-party payment use cases;
- support USD rails including ACH and Wire;
- publicly list Polygon USDC as supported, subject to partner/account enablement.

This produces the correct role assignment:

```text
Maria = Iron customer, named-account holder, verified wallet controller
Antoine = third-party bank sender
```

Maria can truthfully establish ownership of the destination wallet. Antoine is not the
crypto purchaser claiming control of Maria's wallet; he is a bank sender paying Maria.

### Product tradeoffs

This is a stablecoin receiving account, not an instant card checkout:

- funding uses bank-transfer rails rather than Visa, Apple Pay, Google Pay, Venmo, or
  pull-style direct debit;
- ACH and Wire settlement depends on bank cutoffs, clearing, compliance, and provider
  operations;
- the recipient must complete provider onboarding;
- the bank-payment surface exposes the verified beneficiary name;
- exact categories such as tips, donations, sales, and creator payments still require
  written approval;
- raw account credentials require provider-approved presentation and privacy controls.

Coin Card must use status-driven language such as “Usually settles within several
business days” rather than promise a fixed duration. Iron's developer estimates and
MoonPay support estimates were not fully consistent at the time of evaluation.

### Autoramp and PBR findings

An Iron Autoramp is a standing conversion rule connecting source assets/rails to a
destination asset and account. Iron documents optional pay by reference:

- multiple PBR Autoramps for one customer can share one Virtual Account;
- each gets an `inbound_payment_reference` such as `IR-XXXXXX`;
- the sender must include it verbatim;
- unmatched deposits are returned;
- USD `AchWire` is among the documented supported PBR rail types.

Iron's transaction resource documents `autoramp_id`, allowing Coin Card to resolve the
provider transaction directly to its immutable fiat-route version. Webhooks can remain
lightweight notifications; Coin Card fetches the authoritative transaction for
correlation and current lifecycle.

The transaction webhook and transaction-status webhook expose transaction identity and
progress. The authoritative transaction resource provides the richer amounts, fees,
tracking, Autoramp correlation, and payout hash. Iron documents `transaction_status` as
current and the older `status` field as deprecated.

### Control-plane finding

Iron permits Autoramp management through the Partner Dashboard as well as the API.
Therefore a code-only rule against `PATCH` is insufficient. The frozen invariant covers
every control plane, requires preventive provider permissions, and treats continuous
reconciliation as a compensating control.

### Independent settlement finding

Iron's payout transaction hash supplies the bridge to independent Polygon evidence.
Coin Card can verify the successful transaction receipt and the native-USDC `Transfer`
log against its immutable contract, wallet, and atomic-amount snapshot. This avoids
depending on Iron to place every historical destination fact in one transaction record.

---

## Final status board

```text
MoonPay Platform Buy → unrelated recipient
  BLOCKED
  Requires explicit product/compliance/contractual exception.

Iron Virtual Accounts → third-party USD → recipient-owned Polygon USDC wallet
  PRODUCT FIT SUPPORTED BY PUBLIC DOCUMENTATION
  ARCHITECTURE FROZEN
  PARTNER / CONTRACT / EMPIRICAL VALIDATION REQUIRED
```

No provider rail is authorized for production by this decision record.

---

## Remaining Iron launch gates

1. Production RBAC, audit logs, and break-glass controls.
2. Exact behavior of deposits referencing disabled Autoramps.
3. PBR preservation across real ACH and Wire originators.
4. Production API/schema guarantees under the pinned version.
5. Contractual approval for intended customers and payment categories.
6. ACH-return, fraud, reversal, reserve, and recovery allocation.
7. Pricing, volume requirements, limits, availability, support, and liability.

See:

- `IRON_COIN_CARD_FIAT_RAIL_DILIGENCE_MASTER_V1.md`
- `IRON_PROVIDER_DILIGENCE_QUESTIONNAIRE_V1.md`
- `IRON_PROVIDER_VALIDATION_MATRIX_V1.md`

---

## Primary official sources

### MoonPay Platform

- [Platform introduction](https://dev.moonpay.com/platform/overview/introduction)
- [Core concepts](https://dev.moonpay.com/platform/overview/core-concepts)
- [Choose a payment method](https://dev.moonpay.com/platform/guides/payment-methods)
- [Pay with the Buy Button](https://dev.moonpay.com/platform/guides/pay-with-buy-button)
- [Pay with card](https://dev.moonpay.com/platform/guides/pay-with-card)
- [Guest checkout](https://dev.moonpay.com/platform/guides/guest-checkout)
- [Challenge frame](https://dev.moonpay.com/platform/frames/challenge)
- [Get a Platform quote](https://dev.moonpay.com/api-reference/platform/endpoints/quotes/get)
- [Platform transaction object](https://dev.moonpay.com/api-reference/platform/objects-and-types/transaction)
- [Platform asset object](https://dev.moonpay.com/api-reference/platform/objects-and-types/asset)
- [Going live](https://dev.moonpay.com/platform/overview/going-live)
- [MoonPay U.S. Terms](https://www.moonpay.com/legal/terms_of_use_usa)
- [Express Checkout Terms](https://www.moonpay.com/legal/terms_of_use_express_checkout)

### Iron and Virtual Accounts

- [Iron Virtual Accounts](https://docs.iron.xyz/account)
- [Iron Autoramp and pay by reference](https://docs.iron.xyz/autoramp)
- [Get an Autoramp by ID](https://docs.iron.xyz/reference-sandbox/autoramp/get-an-autoramp-by-id)
- [Get Autoramp transactions by IDs](https://docs.iron.xyz/reference-sandbox/autoramp/get-autoramp-transactions-by-transaction-ids)
- [Iron transaction status](https://docs.iron.xyz/transaction-status)
- [Iron webhooks](https://docs.iron.xyz/webhooks)
- [Iron API Versions](https://docs.iron.xyz/versioning)
- [MoonPay Virtual Accounts explained](https://support.moonpay.com/en/articles/381402-virtual-accounts-explained)
- [USD deposits by ACH or Wire](https://support.moonpay.com/en/articles/727237-virtual-account-deposits-via-ach-or-wire-usd)
- [Supported Virtual Account stablecoins and chains](https://support.moonpay.com/en/articles/681880-supported-countries-currencies-and-stablecoins-for-virtual-accounts)
