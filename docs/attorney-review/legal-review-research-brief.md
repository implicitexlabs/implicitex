# Legal Review Research Brief

Last updated: 2026-05-29

## Purpose

This document is a research brief for the attorney review gate. It identifies
10 platforms whose legal language is worth reviewing before finalizing ImplicitEx's
Terms, Privacy, Legal, and Jurisdictions pages.

This document is for comparative review only. It is not a clause library and
should not be used to copy language from third-party terms. The purpose is to
identify common legal risk categories, user-responsibility patterns, and
disclosure structures that ImplicitEx's counsel can adapt to ImplicitEx's actual
service model.

## Source Handling Rule

Third-party clauses should not be copied into ImplicitEx legal pages. Each source
should be used to identify risk categories, disclosure patterns, and
user-responsibility structures, then rewritten for ImplicitEx's actual model:
non-custodial, no hosted wallet, no fiat redemption, no escrow, no recovery, and
no reversal.

---

## ImplicitEx Service Model Boundaries

ImplicitEx is intended to operate as a non-custodial USDC transfer interface and
smart-contract execution layer.

ImplicitEx does not:

- custody user funds
- hold private keys
- provide escrow
- reverse transactions
- recover mistakenly sent funds
- redeem USDC for fiat
- act as a bank
- act as a centralized exchange
- guarantee delivery outside confirmed smart-contract execution
- provide legal, tax, investment, or financial advice

These boundaries define where ImplicitEx's legal language must stay distinct from
comparable platforms. Services such as Coinbase, MoonPay, Transak, and PayPal
operate under custodial, on-ramp, exchange, or regulated financial-service models.
Borrowing their language without adjustment risks implying obligations, liabilities,
or regulatory postures that do not apply to ImplicitEx.

---

## Platforms to Study

| Priority | Platform | Why it matters |
|---:|---|---|
| 1 | Circle / USDC | USDC is the asset layer. Essential for stablecoin-specific disclaimers. |
| 2 | Coinbase Commerce | Closest legal pattern for crypto payment acceptance without platform custody of funds. |
| 3 | MetaMask / Consensys | Best model for wallet-interface disclaimers and third-party blockchain/service risk. |
| 4 | Trust Wallet | States the self-custody/non-custodial relationship plainly. |
| 5 | MoonPay | "We deliver to the wallet address you provide" language; irreversible delivery. |
| 6 | Transak | Compliance-heavy: KYC/AML/sanctions framing, restricted jurisdictions, user representations. |
| 7 | Ramp Network | Jurisdictional warnings; no government compensation scheme, no FSCS/ombudsman-style protection. |
| 8 | BitPay | Crypto payment role, third-party disclaimers, "not an exchange" positioning, payment finality. |
| 9 | PayPal Crypto / PYUSD | Consumer-facing stablecoin disclaimers: not legal tender, not bank deposit, not FDIC-insured. |
| 10 | Cash App Bitcoin | Clean consumer-risk language: irreversibility, no FDIC/SIPC, regulatory-change risk. |

### What to review from each

**Circle — two distinct sources (see below)**
Circle Mint User Agreement: useful mainly as a contrast source — Circle is a
custodial, institutional, account-based service. USDC Terms: more directly relevant
because ImplicitEx users are interacting with USDC itself, not opening Circle accounts.

**Coinbase Commerce**
Merchant wallet responsibility, no crypto storage by platform, supported assets,
transaction finality, third-party wallet risk.

**MetaMask / Consensys**
Wallet connection risk, third-party services, user-controlled transactions,
no guarantee of protocol performance.

**Trust Wallet**
Private-key responsibility, user control, transaction authorization, wallet
security, local custody framing.

**MoonPay**
Wallet-address accuracy, order execution, no custody language, irreversible
delivery, user responsibility for wallet access.

**Transak**
KYC/AML/sanctions framing, service availability, supported jurisdictions,
user representations, transaction screening.

**Ramp Network**
No government compensation scheme, no ombudsman/insurance-style protection,
restricted jurisdictions, user-risk warnings.

**BitPay**
Crypto payment role, third-party purchase/swap disclaimers, merchant/shopper
terms, payment finality.

**PayPal Crypto / PYUSD**
Crypto account terms, crypto payment terms, stablecoin not legal tender,
not bank deposit, not FDIC-insured.

**Cash App Bitcoin**
Irreversibility, no FDIC/SIPC protection, regulatory-change risk,
accidental/fraudulent transaction loss.

---

## Review Order

1. **Circle USDC Terms** — stablecoin risk. USDC is the asset; start here. Review USDC Terms before Circle Mint User Agreement.
2. **Trust Wallet + MetaMask** — non-custodial wallet responsibility.
3. **Coinbase Commerce** — crypto payment/interface role.
4. **Cash App + PayPal** — consumer-readable risk warnings and plain-English style.
5. **MoonPay / Transak / Ramp** — jurisdiction, compliance, wallet-address, and order-risk language.

---

## Risk Categories to Cover (ImplicitEx-specific)

These ten categories are the target output of the comparative review. Every clause
should be drafted for ImplicitEx's actual service model, not borrowed verbatim.

### 1. Non-custody statement

ImplicitEx does not custody, hold, control, recover, or reverse user funds.
The platform is a transfer execution interface only.

### 2. User wallet responsibility

The user is responsible for wallet access, private key security, wallet connection
permissions, and transaction approval. ImplicitEx cannot access, freeze, or recover
a user's wallet.

### 3. Recipient-address responsibility

The user is responsible for verifying the recipient address before signing.
An incorrect address cannot be corrected after broadcast.

### 4. Blockchain finality / irreversibility

Once broadcast and confirmed on Polygon, transactions are irreversible.
ImplicitEx has no mechanism to reverse, retrieve, or recover a completed transfer.

### 5. USDC-specific risk

USDC is issued by Circle, not ImplicitEx. ImplicitEx does not redeem USDC for fiat.
USDC is a stablecoin, not legal tender, not a bank deposit, and not FDIC or SIPC
insured. Circle's own terms, risk factors, and operational decisions govern USDC.

### 6. Network and protocol risk

Polygon, wallet extensions, RPC providers, block explorers, the USDC token contract,
and all third-party infrastructure can fail, change, or become unavailable. ImplicitEx
does not guarantee the availability or performance of any third-party service.

### 7. Fee disclosure

ImplicitEx charges a 1% platform fee paid by the sender in addition to the transfer
amount. The recipient receives the full transfer amount. Polygon gas fees are separate
and borne by the sender's wallet. Fees are non-refundable once a transaction is
executed.

### 8. No escrow / no dispute resolution over funds

ImplicitEx is not an escrow service. It does not hold funds, does not mediate
recipient disputes, and does not adjudicate payment disagreements between senders
and recipients.

### 9. Jurisdiction and availability

Service availability is a platform policy decision, not a representation of legal
authorization in any jurisdiction. Users are responsible for ensuring their use
of ImplicitEx complies with applicable law in their jurisdiction.

### 10. Prohibited use / compliance

ImplicitEx may not be used for sanctions evasion, fraud, money laundering, illegal
commerce, or any use prohibited by applicable law. Users represent that their use
is lawful and that they are not on any prohibited-party list.

---

## Circle Comparative Review

Circle is a reference source for this review, not a template. Two distinct Circle
documents are relevant and should be treated separately.

### Source provenance

**Circle Mint User Agreement**
- URL: https://www.circle.com/legal/user-agreement
- Revised date shown by source: January 7, 2026
- Accessed: 2026-05-29
- Audience: institutional customers only (exchanges, wallet providers, banks,
  consumer-app companies). Not available to individuals.
- Relevance to ImplicitEx: **contrast source**. Circle Mint is a custodial,
  account-based, institutional service. ImplicitEx is the opposite. The value
  of Circle Mint as a reference is understanding what ImplicitEx explicitly is not.

**USDC Terms**
- URL: https://www.circle.com/legal/usdc-terms
- Revised date shown by source: December 12, 2025
- Accessed: 2026-05-29
- Audience: anyone interacting with USDC as a token.
- Relevance to ImplicitEx: **more directly applicable**. ImplicitEx users interact
  with USDC itself. The USDC Terms govern the token, not a custody relationship.
  Risk disclosures about USDC as a digital asset belong here, not in Circle Mint
  language.

---

### Category 1 — Non-custody

Pattern observed (Circle Mint):
Circle explicitly acknowledges custody — it controls private keys and holds funds
in hosted wallets. This makes Circle Mint most useful as an inverse: ImplicitEx
can define what it does not do by contrast with what Circle Mint explicitly does.

ImplicitEx adaptation:
ImplicitEx does not hold, custody, or control user funds at any point. It has no
hosted wallet, no account, and no private-key access. The transfer contract executes
at the user's direction under the user's signature only.

---

### Category 2 — User wallet responsibility

Pattern observed (Circle Mint §8):
Circle places security responsibility on the user for access credentials and states
it bears no liability for losses from the user's failure to protect account information.

ImplicitEx adaptation:
The user is solely responsible for the security of their wallet, private keys, and
wallet extension permissions. ImplicitEx has no visibility into or control over the
user's wallet. Loss of wallet access, compromised keys, or unauthorized approvals
are the user's responsibility.

---

### Category 3 — Recipient-address responsibility

Pattern observed (Circle Mint §2.5):
Circle disclaims liability for incorrect blockchain destination addresses and states
it does not guarantee the identity of a transfer recipient.

ImplicitEx adaptation:
This risk category maps conceptually, but the clause must be rewritten for
ImplicitEx's non-custodial, no-account model. ImplicitEx validates address format
only; it cannot verify the identity of the address owner. The user is solely
responsible for verifying the recipient address before approving the transaction.
Funds sent to an incorrect address cannot be retrieved or reversed.

---

### Category 4 — Blockchain finality / irreversibility

Pattern observed (Circle Mint §2.5; Connecticut and New York state disclosures):
Circle states that digital currency transfers are irreversible once broadcast.
State-specific disclosures use plain language: "transactions in virtual currency
are irreversible" and "losses due to fraudulent or accidental transactions may not
be recoverable." The state disclosures are useful plain-English reference patterns
because they show how irreversibility and non-recoverability are commonly disclosed
in consumer-facing virtual-currency terms. Counsel should determine whether similar
language is appropriate for ImplicitEx.

ImplicitEx adaptation:
Once a transfer is broadcast to Polygon and confirmed, it is irreversible. ImplicitEx
has no mechanism to reverse, cancel, or recover a completed transfer. Losses from
incorrect addresses, unauthorized approvals, or fraud may not be recoverable.

---

### Category 5 — USDC-specific risk

Pattern observed (Circle footer; USDC Terms; state disclosures):
USDC is not legal tender, not backed by any government, not covered by FDIC or SIPC
protections, and not a bank deposit. The Circle footer and state disclosures state
this plainly.

Note: Circle Mint §14 refers to funds "held in your Circle Mint account" — this
framing does not apply to ImplicitEx. ImplicitEx does not hold balances, accounts,
or deposits. The USDC Terms and the Circle footer disclaimers are the correct sources
here; §14 account language should not be adapted for ImplicitEx copy.

ImplicitEx adaptation:
USDC is a digital asset issued by Circle, not by ImplicitEx. It is not legal tender,
not a bank deposit, and not covered by FDIC or SIPC protections. ImplicitEx does
not issue, hold, redeem, or guarantee the value of USDC. Circle's USDC Terms and
operational decisions govern USDC itself.

---

### Category 6 — Network and protocol risk

Pattern observed (Circle Mint §12, §2.5):
Circle disclaims control over underlying blockchain protocols and makes no guarantee
that a transfer will be confirmed by the network. The open-source protocol framing
is directly useful.

ImplicitEx adaptation:
ImplicitEx does not control the Polygon network, the USDC token contract, wallet
extensions, RPC providers, or any third-party infrastructure. Service availability
depends on factors outside ImplicitEx's control. ImplicitEx makes no guarantee that
a submitted transaction will be confirmed within any particular time or at all.

---

### Category 7 — Fee disclosure

Pattern observed (Circle Mint §10):
Circle separates its own fees from network fees and places network fee responsibility
on the user.

ImplicitEx adaptation:
ImplicitEx charges a 1% platform fee paid by the sender in addition to the transfer
amount. The recipient receives the full transfer amount. The fee and total debit are
shown in the transfer preview before approval. Polygon gas fees are separate, paid
by the sender's wallet, and not collected by ImplicitEx. All fees are non-refundable
once a transaction is executed.

---

### Category 8 — No escrow / no dispute resolution

Pattern observed (Circle Mint §18 — inverse):
Circle has a refund and error-correction process specifically because it holds funds.
ImplicitEx does not hold funds and therefore has no equivalent mechanism. The
contrast is what defines ImplicitEx's position.

ImplicitEx adaptation:
ImplicitEx is not an escrow service. It does not hold funds at any point in the
transfer process, does not mediate disputes between senders and recipients, and has
no mechanism to freeze, hold, or return funds on behalf of either party.

---

### Category 9 — Jurisdiction and availability

Pattern observed (Circle Mint §1):
Circle reserves the right to restrict service availability by jurisdiction at its
discretion, and states this is not a legal authorization claim.

ImplicitEx adaptation:
Service availability is a platform policy decision. It is not a representation that
use of ImplicitEx is legally authorized in any jurisdiction. Users are responsible
for ensuring their use complies with the laws of their jurisdiction.

---

### Category 10 — Prohibited use / compliance

Pattern observed (Circle Mint §20, §35):
Circle prohibits money laundering, sanctions evasion, terrorist financing, fraud,
market manipulation, and transactions involving OFAC-listed persons or restricted
territories. Users represent their use is lawful.

ImplicitEx adaptation:
ImplicitEx may not be used for money laundering, sanctions evasion, fraud, terrorist
financing, or any unlawful purpose. Users represent that their use is lawful, that
they are not on any OFAC or equivalent prohibited-party list, and that they are not
resident in a jurisdiction subject to comprehensive sanctions.

---

## Attorney Review Package

These documents constitute the attorney review package for Gate 3:

- `docs/product/service-model-summary.md` — factual service model summary with Gate 2 evidence
- `docs/product/legal-review-research-brief.md` — this document; 10 risk categories, Circle comparative review
- `app-web/frontend/public/legal.html` — live legal page
- `app-web/frontend/public/privacy.html` — live privacy page
- `app-web/frontend/public/components/terms.html` — live terms page
- `app-web/frontend/public/jurisdictions.html` — live jurisdiction availability page

All legal pages remain in draft status until reviewed by counsel.

---

## Notes

- This guide is a research input for the attorney, not a substitute for legal review.
- No clause from any referenced platform should appear verbatim in ImplicitEx pages.
- The goal is service-model-accurate language: do not pull ImplicitEx into "exchange,"
  "custodian," "broker," or "escrow" territory by borrowing language from services
  that operate under those models.
- Review the transaction-execution-contract (`docs/contracts/transaction-execution-contract.md`)
  alongside the legal pages — the user-facing product contract and the legal pages
  should describe the same service.
