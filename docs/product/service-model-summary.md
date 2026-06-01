# ImplicitEx Service Model Summary

Last updated: 2026-06-01

This document is a factual summary of the ImplicitEx service model for attorney review.
It is not marketing copy and not legal copy. It describes what the product does and
does not do, and records the evidence base for those claims.

---

## Product

**Name:** ImplicitEx
**Description:** Non-custodial USDC transfer interface and smart-contract execution layer
operating on Polygon.

---

## What ImplicitEx Does

- Connects to a user's self-custodied wallet.
- Displays transfer amount, platform fee, and total debit before approval.
- Requests user authorization through the user's wallet.
- Executes USDC transfers through a deployed smart contract.
- Routes the transfer amount to the recipient and the platform fee to the treasury wallet.
- Displays transaction and receipt status information.

---

## What ImplicitEx Does Not Do

- Custody user funds.
- Hold private keys.
- Operate hosted wallets.
- Provide escrow.
- Reverse transactions.
- Recover lost funds.
- Redeem USDC for fiat currency.
- Act as a bank, broker, exchange, money transmitter, or investment adviser.

---

## Current Economics

| Item | Value |
|---|---|
| Asset | USDC (Circle, Polygon native) |
| Network | Polygon mainnet (chainId 137) |
| Fee model | 1% fee-on-top (additive) |
| Sender pays | Transfer Amount + Platform Fee + Network Gas |
| Recipient receives | Full transfer amount |
| Fee minimum | 0.01 USDC on a 1 USDC transfer |
| Transfer cap | 250 USDC (soft launch limit) |

---

## Gate 2 Evidence (2026-06-01)

Live Polygon mainnet transfer completed under a controlled smoke test.

| Claim | Evidence |
|---|---|
| Approval flow | MetaMask spending cap prompt: 1.01 USDC, exact contract address |
| transferWithFee execution | Transaction confirmed on Polygon |
| Recipient received full transfer amount | Polygonscan: 1.00 USDC to recipient |
| Treasury received platform fee | Polygonscan: 0.01 USDC to treasury |
| Sender balance delta | 9.22 → 8.21 USDC (−1.01 exact) |
| Receipt lifecycle | AUTHORIZING → CONFIRMED state progression observed |
| Contract address | 0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0 (source-verified) |

Evidence file: `docs/operations/evidence/gate2-live-transfer-smoke-2026-06-01.md`

---

## Smart Contract

| Item | Value |
|---|---|
| Address | 0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0 |
| Network | Polygon mainnet |
| Source verified | Yes (Polygonscan) |
| Owner | Safe multisig |
| Treasury | Ledger Nano S+ hardware wallet |
| Fee cap | 100 bps maximum (1%) — hardcoded, cannot exceed |
| Min transfer | 1 USDC |
| Fund routing | Direct — contract never holds USDC |

---

## Attorney Review Package

| Document | Purpose |
|---|---|
| `docs/product/service-model-summary.md` | This document — factual service model |
| `docs/product/legal-review-research-brief.md` | 10 risk categories, Circle comparative review |
| `app-web/frontend/public/legal.html` | Live legal page |
| `app-web/frontend/public/privacy.html` | Live privacy page |
| `app-web/frontend/public/components/terms.html` | Live terms page |
| `app-web/frontend/public/jurisdictions.html` | Live jurisdiction availability page |

---

## Open Questions for Attorney Review

1. **Jurisdiction strategy** — Which jurisdictions should be blocked vs. unsupported vs.
   deferred? Is a U.S.-only launch advisable? Are state-by-state restrictions appropriate?

2. **Regulatory characterization** — Given the actual service model, how should ImplicitEx
   characterize itself? What terminology should be avoided?

3. **Compliance expectations** — Given a non-custodial fee-on-top transfer model, what
   ongoing obligations should be anticipated before public launch?
