# ImplicitEx Architecture and Security Overview

**Document version:** 0.1 — Draft  
**Date:** 2026-07-22  
**Contact:** Antoine Dennison · connect@implicitex.com  
**Reference:** Blockaid Ticket #1290666 / #1290665  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Transaction Lifecycle](#3-transaction-lifecycle)
4. [Trust Boundaries](#4-trust-boundaries)
5. [Smart Contract Behavior](#5-smart-contract-behavior)
6. [Deployed Security Controls](#6-deployed-security-controls)
7. [UI Transparency and Approval Flow](#7-ui-transparency-and-approval-flow)
8. [Internal Verification Evidence](#8-internal-verification-evidence)
9. [Known Limitations and Transparency Disclosures](#9-known-limitations-and-transparency-disclosures)
10. [Reviewer Reproduction Procedure](#10-reviewer-reproduction-procedure)
11. [Deployed Addresses and Evidence Inventory](#11-deployed-addresses-and-evidence-inventory)

---

## 1. Executive Summary

**What is ImplicitEx?**

ImplicitEx is a non-custodial USDC transfer interface operating on Polygon (chain ID 137). It allows a sender to transfer USDC to a specified recipient address. A platform fee of 1% is charged on each transfer, with a hard cap of 10 USDC per transaction. The application never holds, routes through, or controls user funds beyond what the user explicitly authorizes through their wallet.

**Why does the wallet request an approval?**

USDC is an ERC-20 token. ERC-20 tokens cannot be spent by a smart contract without the token holder first granting a spending allowance to that contract. The `approve()` call is the standard ERC-20 mechanism for establishing this permission. ImplicitEx requests an allowance equal to exactly the amount the user has already reviewed on-screen — the recipient amount plus the platform fee. No additional allowance is requested.

**Why the approval amount is exact — not unlimited**

Many applications request an unlimited or large allowance to avoid requiring a new approval on each transaction. ImplicitEx does not do this. The allowance request covers the exact transfer total for the current transaction only. After the contract executes `transferFrom()`, the allowance returns to zero.

**Why ImplicitEx is non-custodial**

The smart contract does not hold funds at any point in the transfer flow. The `transferWithFee()` function calls `safeTransferFrom()` twice in a single execution: once from the sender directly to the recipient, and once from the sender directly to the treasury. The contract is not an intermediate holder. If either transfer fails, the transaction reverts and no funds move.

---

## 2. System Architecture

### 2.1 Component Map

```
User Browser
     │
     ▼
ImplicitEx Transfer Portal
(https://implicitex.com / https://portal.implicitex.com)
     │
     ├──── Reads on-chain state via public JSON-RPC
     │     (polygon-bor-rpc.publicnode.com, chain ID 137)
     │
     ▼
MetaMask (or WalletConnect-compatible wallet)
     │
     ├──── Step 1: User signs USDC approve() for exact total
     │
     └──── Step 2: User signs transferWithFee() execution
               │
               ▼
    ImplicitExTransfer Contract
    (0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0)
               │
               ├────► Recipient (user-specified address)
               │       Amount: transfer amount
               │
               └────► Treasury (0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919)
                       Amount: platform fee (1%, max 10 USDC)
```

### 2.2 Domains

| Domain | Role | Status |
|---|---|---|
| `https://implicitex.com` | Primary production domain | Live |
| `https://portal.implicitex.com` | Transfer portal (direct entry) | Live |
| `https://implicitex-236f2.web.app` | Staging / Firebase hosting URL | Staging — included in Blockaid report |

### 2.3 Network

| Parameter | Value |
|---|---|
| Network | Polygon PoS Mainnet |
| Chain ID | 137 (hex: 0x89) |
| RPC | polygon-bor-rpc.publicnode.com (public) |
| Block explorer | polygonscan.com |

---

## 3. Transaction Lifecycle

### 3.1 Step-by-step flow

The following describes a 1.00 USDC transfer as an example.

**Step 1 — User input**

The user enters:
- Recipient Ethereum address
- Transfer amount (e.g. 1.00 USDC)

**Step 2 — Pre-flight validation (before any wallet prompt)**

The portal calls `previewTransfer()` on the contract, a read-only view function that returns:
- Calculated fee
- Total debit (amount + fee)
- Sender USDC balance
- Current USDC allowance
- Boolean indicating whether the transfer can proceed

The portal also checks:
- Correct network (Polygon mainnet, chain ID 137)
- Recipient address is non-zero and non-contract
- Amount within configured transfer limits

No wallet action is requested during this phase.

**Step 3 — Review screen presented**

Before any wallet prompt, the portal displays:

```
Recipient:      0xe0B02A6d...796B
Amount:         1.000000 USDC
Platform fee:   0.010000 USDC
Total debit:    1.010000 USDC
Network:        Polygon
```

The user must proceed past this screen to trigger any wallet action.

**Step 4 — USDC spending approval (wallet prompt 1 of 2)**

The portal calls `approve(contractAddress, totalDebit)` on the USDC token contract.

MetaMask surfaces this as a "Set a spending cap for your USDC" prompt. The spending cap displayed is the exact total debit (1.01 USDC in this example). This is the step flagged by Blockaid.

The approval is limited to the exact amount already displayed on the review screen. No additional buffer is requested.

**Step 5 — Transfer execution (wallet prompt 2 of 2)**

After approval is confirmed on-chain, the portal calls `transferWithFee(recipientAddress, 1000000)` on the ImplicitExTransfer contract.

MetaMask surfaces this as a contract interaction confirmation. The user must separately approve this second step.

**Step 6 — On-chain execution**

The contract executes atomically:

```
USDC.safeTransferFrom(sender, recipient, 1000000)    // 1.000000 USDC to recipient
USDC.safeTransferFrom(sender, treasury, 10000)       // 0.010000 USDC fee to treasury
```

If either transfer fails, the entire transaction reverts.

**Step 7 — Confirmation**

The portal polls for transaction confirmation and displays a receipt only after the transaction is confirmed on-chain. It does not report success at submission time.

### 3.2 Economic summary (1.00 USDC example)

| Flow | Amount |
|---|---|
| Sender USDC deducted | 1.010000 USDC |
| Recipient USDC received | 1.000000 USDC |
| Treasury fee received | 0.010000 USDC |
| Contract retained | 0.000000 USDC |

---

## 4. Trust Boundaries

### 4.1 What ImplicitEx can and cannot do

| Capability | Status |
|---|---|
| Read wallet address | Yes — required to populate sender |
| Request USDC approval for exact transfer total | Yes — ERC-20 mechanism |
| Execute `transferWithFee()` after approval | Yes — requires separate user confirmation |
| Access funds beyond the approved amount | No |
| Bypass wallet confirmation | No |
| Move funds without user wallet signature | No |
| Hold user funds in the contract | No |
| Withdraw accumulated funds from the contract | No |
| Approve unlimited USDC allowance | No — hard-coded to exact amount per transaction |
| Reverse or refund a confirmed transaction | No |

### 4.2 User authorization boundary

Every on-chain action requires a signature from the user's private key. The wallet (MetaMask or WalletConnect-compatible) mediates this. The portal cannot bypass wallet authorization.

```
Portal:   Constructs and sends transaction request
Wallet:   Displays parameters to user
User:     Signs (or rejects)
Chain:    Executes only if user signature is valid
```

The portal has no mechanism to sign transactions on the user's behalf, store private keys, or initiate transactions without explicit user action.

---

## 5. Smart Contract Behavior

**Contract name:** `ImplicitExTransfer`  
**Solidity version:** ^0.8.24  
**License:** MIT  
**Source:** `/implicitex/app-web/contracts/implicitex_transfer.sol`  

### 5.1 Core function: `transferWithFee(address recipient, uint256 amount)`

This is the only function that moves funds. It:

1. Checks the contract is not paused (`whenNotPaused`)
2. Applies reentrancy guard (`nonReentrant`)
3. Rejects zero address recipient
4. Rejects contract addresses as recipients
5. Enforces minimum transfer amount
6. Enforces transfer precision (amount divisible by configured precision)
7. Calculates fee: `(amount × feeBasisPoints) / 10000`, capped at `MAX_FEE`
8. Executes `safeTransferFrom(sender, recipient, amount)`
9. Executes `safeTransferFrom(sender, treasury, fee)`
10. Emits `TransferExecuted` event

### 5.2 View function: `previewTransfer(address sender, uint256 amount)`

Read-only. Returns:
- `fee` — calculated platform fee
- `totalDebit` — amount + fee
- `balance` — sender USDC balance
- `allowance` — current USDC allowance for the contract
- `canTransfer` — boolean

Used by the portal before presenting the review screen or initiating wallet prompts.

### 5.3 Fee constants (hard-coded at deployment)

| Constant | Value | Description |
|---|---|---|
| `MAX_FEE_BPS` | 100 | Maximum fee rate in basis points (1.00%) |
| `MAX_FEE` | 10,000,000 | Maximum fee in atomic USDC units (10.000000 USDC) |

The owner can lower `feeBasisPoints` but cannot set it above `MAX_FEE_BPS`. The `MAX_FEE` cap is unconditional — at 1,000 USDC and above, the fee is fixed at 10 USDC.

### 5.4 Events emitted

| Event | Trigger |
|---|---|
| `TransferExecuted(sender, recipient, amountSent, feeAmount, totalDebited)` | Every successful transfer |
| `TreasuryUpdated(previousTreasury, newTreasury)` | Treasury address change |
| `FeeUpdated(previousFeeBps, newFeeBps)` | Fee rate change |
| `MinTransferUpdated(previous, new)` | Minimum transfer change |
| `PrecisionUpdated(previous, new)` | Precision setting change |
| `TokensRescued(token, to, amount)` | Non-USDC token rescue |

### 5.5 Owner controls

| Function | Effect |
|---|---|
| `setTreasury(address)` | Update fee recipient |
| `setFeeBasisPoints(uint16)` | Adjust fee rate (max 100 bps) |
| `setMinTransferAmount(uint256)` | Change minimum transfer floor |
| `setTransferPrecision(uint256)` | Change required precision |
| `pause()` | Halt all transfers |
| `unpause()` | Resume transfers |
| `rescueERC20(token, to, amount)` | Recover non-USDC tokens only |

The `rescueERC20` function explicitly rejects USDC (the operating token). This prevents the owner from draining user-approved allowances.

### 5.6 Ownership model

The contract uses `Ownable2Step`. Ownership transfers require two transactions: the current owner proposes a new owner, and the new owner must accept. This prevents accidental ownership loss.

Current owner: `0x776A0D6b9F96445A38303F56d5B923e6d1FF8E97`

---

## 6. Deployed Security Controls

The following controls are active in the currently deployed contract.

| Control | Implementation | Status |
|---|---|---|
| Exact allowance | `approve(contract, amount + fee)` — no unlimited approval | Deployed |
| Non-custodial routing | `safeTransferFrom(sender, recipient)` and `safeTransferFrom(sender, treasury)` — contract is not an intermediate holder | Deployed |
| Reentrancy protection | `nonReentrant` modifier on `transferWithFee()` | Deployed |
| Pause mechanism | `whenNotPaused` modifier; owner can halt all transfers | Deployed |
| Zero-address rejection | Recipient validation in `transferWithFee()` | Deployed |
| Contract-address rejection | Recipient must be EOA | Deployed |
| USDC drain prevention | `rescueERC20` rejects USDC address | Deployed |
| Transfer floor | `minTransferAmount` — 1.000000 USDC | Deployed |
| Transfer ceiling (soft launch) | 250.000000 USDC per transaction | Deployed |
| Fee cap | 10.000000 USDC absolute maximum | Deployed |
| Two-step ownership | `Ownable2Step` — ownership change requires acceptance | Deployed |
| Chain enforcement | Portal validates chain ID before any wallet prompt | Deployed |
| Supported-chain flag | `transfersEnabled` per chain — currently disabled (standby state) | Deployed |
| Atomic execution | Both transfers occur in a single transaction; either both succeed or both revert | Deployed |
| Pending-state UI | Portal does not report success until on-chain confirmation | Deployed |
| Flow identity token | Portal invalidates in-progress flow on account or network change mid-session | Deployed |

---

## 7. UI Transparency and Approval Flow

### 7.1 Review screen

Before any wallet prompt, the user sees a summary of all parameters for the pending transaction. The review screen displays recipient address, transfer amount, platform fee, total wallet debit, and network.

**[SCREENSHOT PLACEHOLDER — SS-01]**  
*Capture: Review screen showing recipient, 1.00 USDC amount, 0.010000 USDC fee, 1.010000 USDC total debit, Polygon network indicator.*

### 7.2 USDC spending approval (Prompt 1 of 2)

MetaMask presents the spending-cap prompt. The cap displayed equals the total debit shown on the review screen. This is the prompt currently flagged by Blockaid.

**[SCREENSHOT PLACEHOLDER — SS-02]**  
*Capture: MetaMask "Set a spending cap for your USDC" dialog. Spending cap field showing 1.01 USDC (or transfer-specific amount). Not unlimited.*

### 7.3 Transfer execution (Prompt 2 of 2)

After the approval is confirmed, a second MetaMask prompt requests confirmation of the contract execution. The user must separately approve this call.

**[SCREENSHOT PLACEHOLDER — SS-03]**  
*Capture: MetaMask contract interaction confirmation dialog for transferWithFee() call.*

### 7.4 On-chain confirmation state

The portal displays a pending state while awaiting block confirmation. It transitions to a confirmed state only after confirmation is received.

**[SCREENSHOT PLACEHOLDER — SS-04]**  
*Capture: Portal "AWAITING POLYGON..." pending state followed by confirmed state with Polygonscan link.*

---

## 8. Internal Verification Evidence

ImplicitEx has not undergone a third-party security audit at this stage. The following verification record reflects internal testing executed against the deployed application.

### 8.1 Test suite results (current)

| Suite | Tests | Result |
|---|---|---|
| Contract (Hardhat / Chai) | 59 / 59 | PASS |
| Observability | 31 / 31 | PASS |
| Analytics | 24 / 24 | PASS |
| Consent | 15 / 15 | PASS |
| Portal integrity | — | PASS |
| Static reference audit | 631 references | PASS |

### 8.2 Contract test coverage (selected areas)

The contract test suite covers the following scenarios:

- Constructor validation (zero-address rejection, fee cap enforcement)
- Treasury management and event emission
- Fee configuration (floor, cap, basis-point boundaries)
- Transfer execution (happy path, fee routing, balance checks)
- Pause and unpause (state enforcement, event emission)
- Ownership transfer (two-step requirement)
- Recipient validation (zero address, contract address)
- Reentrancy protection
- `previewTransfer()` accuracy
- `rescueERC20` USDC rejection
- Allowance and balance edge cases

### 8.3 Gate 4 — Mainnet controlled live smoke (2026-06-15)

A controlled transfer was executed on Polygon mainnet from the production frontend.

```
Date:           2026-06-15
Network:        Polygon mainnet, chain ID 137
Site:           https://implicitex-236f2.web.app
Contract:       0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0

Sender:         0x2489587C9da6EaB970a5479BA70273BA37961221
Recipient:      0xe0B02A6d9738aa36eE48004211E264b7a815796B
Treasury:       0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919

Amount:         1.000000 USDC
Fee:            0.010000 USDC  (100 bps)
Total debit:    1.010000 USDC

Transaction:    0x37fd733a7f1854740bf702aa5bf59794f4ebab0f39d2a84fb2c231c29df622d9
Block:          88565097
Explorer:       https://polygonscan.com/tx/0x37fd733a7f1854740bf702aa5bf59794f4ebab0f39d2a84fb2c231c29df622d9
```

**Economic verification:**

| Flow | Expected | Confirmed |
|---|---|---|
| Sender deducted | 1.010000 USDC | ✓ |
| Recipient received | 1.000000 USDC | ✓ (Polygonscan) |
| Treasury received | 0.010000 USDC | ✓ (Polygonscan) |
| Contract retained | 0.000000 USDC | ✓ |

### 8.4 Gate 5 — Public launch attempt (2026-06-18)

Transfers were enabled for a first-user walkthrough. The walkthrough was halted at the USDC approval step due to the Blockaid "deceptive request" warning. No transfer was executed. Transfers were returned to disabled standby state.

The Blockaid false-positive report was submitted 2026-06-18 for both `implicitex.com` and `implicitex-236f2.web.app`.

---

## 9. Known Limitations and Transparency Disclosures

The following limitations apply to the current deployed version.

| Item | Status |
|---|---|
| Third-party security audit | Not yet completed. External audit is intended as the platform matures toward broader distribution. |
| Transfer reversibility | Confirmed blockchain transactions cannot be reversed. ImplicitEx has no reversal mechanism. |
| Network support | Polygon mainnet only. Other networks are not supported in the current deployment. |
| Transfer ceiling | 250.00 USDC per transaction (soft launch cap). |
| Mobile wallet compatibility | MetaMask desktop confirmed. MetaMask Mobile in-app browser is under active testing — a provider-sequencing issue affecting the second prompt (transfer execution) has been diagnosed and patched. |
| WalletConnect | Integration is implemented and active in production. |
| Contract ownership | Single-key `Ownable2Step`. Multi-signature governance is on the planning roadmap but not deployed. |
| Transfers currently disabled | Transfers are in standby state pending Blockaid classification. The `transfersEnabled` flag is false at both the global and per-chain level. No user transfer can be initiated while in this state. |

---

## 10. Reviewer Reproduction Procedure

A Blockaid analyst can independently verify the following without wallet connection.

### 10.1 Contract source verification

The contract source code is available in the project repository. The deployed contract at `0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0` can be inspected on Polygonscan. Source verification status: [VERIFY — confirm whether contract source is verified on Polygonscan at time of submission].

### 10.2 Transaction verification

The Gate 4 transfer transaction can be verified on Polygonscan:

```
https://polygonscan.com/tx/0x37fd733a7f1854740bf702aa5bf59794f4ebab0f39d2a84fb2c231c29df622d9
```

The ERC-20 token transfer log will show two transfers from the same sender:
- To `0xe0B02A6d...796B` — 1.000000 USDC (recipient)
- To `0xa7cE4232...3919` — 0.010000 USDC (treasury fee)

### 10.3 Contract state query

The following read calls can be made against the deployed contract without a wallet:

| Function | Returns |
|---|---|
| `feeBasisPoints()` | Current fee rate in basis points (100 = 1%) |
| `MAX_FEE_BPS()` | Hard-coded fee ceiling (100) |
| `MAX_FEE()` | Hard-coded fee cap in atomic units (10000000 = 10 USDC) |
| `minTransferAmount()` | Minimum transfer floor (1000000 = 1 USDC) |
| `treasury()` | Current fee recipient address |
| `paused()` | Whether transfers are currently paused |
| `owner()` | Current contract owner address |

### 10.4 Approval flow reproduction

When transfers are re-enabled, the approval flow can be reproduced by:

1. Connecting a Polygon wallet with at least 2 USDC
2. Entering any valid EOA recipient and amount (e.g. 1.00 USDC)
3. Proceeding to the review screen
4. Confirming to trigger the approval step

The MetaMask spending-cap prompt will show the exact total debit, not an unlimited amount.

---

## 11. Deployed Addresses and Evidence Inventory

### 11.1 Deployed addresses

| Component | Address |
|---|---|
| ImplicitExTransfer contract | `0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0` |
| USDC (Circle native, Polygon) | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` |
| Treasury | `0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919` |
| Contract owner | `0x776A0D6b9F96445A38303F56d5B923e6d1FF8E97` |
| Network | Polygon PoS Mainnet |
| Chain ID | 137 |

### 11.2 Deployment record

| Parameter | Value |
|---|---|
| Deployment date | 2026-05-22 |
| Deployment transaction | `0x87593fdb3d256a4a94b3e73877ba0bc433c39e81eefc78334af6da79ff5ef1f3` |
| Ownership transfer TX | `0xd84181dbffbd4f760cfa650b2a1edb1acc17713e66bb5d6d478376dc5202d777` |
| Ownership acceptance TX | `0xd6bfb2876725391c956dbd17ec5f774f9246b50df5667e8b29e8c78305365e90` |

### 11.3 Evidence inventory

| ID | Item | Status |
|---|---|---|
| SS-01 | Review screen screenshot | Pending |
| SS-02 | MetaMask exact-spend approval prompt screenshot | Pending |
| SS-03 | MetaMask transfer execution confirmation screenshot | Pending |
| SS-04 | Portal confirmed-state screenshot | Pending |
| TX-01 | Gate 4 transfer transaction on Polygonscan | Available |
| TC-01 | Contract test suite (59/59 PASS) | Internal |
| TC-02 | Observability suite (31/31 PASS) | Internal |
| TC-03 | Analytics suite (24/24 PASS) | Internal |
| TC-04 | Static reference audit (631 references PASS) | Internal |

### 11.4 Pre-submission checklist

Before submitting this packet to Blockaid:

- [ ] Confirm contract source is verified on Polygonscan (or note if unverified)
- [ ] Capture SS-01 through SS-04 screenshots
- [ ] Confirm current `feeBasisPoints()` read matches 100 via Polygonscan
- [ ] Confirm `paused()` read returns current state
- [ ] Verify Gate 4 transaction link is accessible on Polygonscan
- [ ] Confirm no material contract changes since Gate 4 smoke
- [ ] Review all `[VERIFY]` annotations in this document before sending

---

*This document is a technical overview for security review purposes. It reflects the deployed production state as of 2026-07-22. All contract parameters can be independently verified on Polygonscan (chain ID 137).*

---

**Contact:**  
Antoine Dennison  
ImplicitEx  
connect@implicitex.com  
https://implicitex.com  
