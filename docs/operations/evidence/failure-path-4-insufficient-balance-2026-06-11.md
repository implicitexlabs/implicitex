# Failure Path 4 — Insufficient Balance

**Date:** 2026-06-11
**Branch:** gate3-negative-path-proof
**Outcome:** PENDING — manual wallet test required

---

## Test scope

Verify that entering an amount greater than the connected wallet's USDC balance blocks the
transfer entirely: no wallet prompt, no receipt created, no stale active state after refresh.

This is a UI-level block enforced before any on-chain action. The contract also enforces it
(previewTransfer returns `canTransfer: false` and transferWithFee reverts), but the
correct behavior is that the UI never gets that far.

---

## Code review (2026-06-11)

Code review performed before manual smoke. Three independent enforcement layers found:

**Layer 1 — Live preview (wallet.js updatePreview, ~line 1680)**

- `buildDraftSummary()` computes `insufficientBalance` from `state.usdcBalanceRaw` vs `totalDebit`
- On `insufficientBalance === true`:
  - Renders "Transfer Blocked" summary with have/need amounts
  - Sets status: "Insufficient balance. Have X USDC, need Y USDC."
  - Sets transfer note: "Lower the amount or add USDC before reviewing this transfer."
  - Resets acknowledgement checkbox (stale ack cannot re-arm the button)
  - Sets button to "Insufficient Balance" with native `disabled = true`
  - Returns — does not reach enterReview()

**Layer 2 — enterReview() (~line 1955)**

- Redundant check with the same `insufficientBalance` guard before any review state is set
- Same block + return pattern; never reaches submitTransfer()

**Layer 3 — submitTransfer() fresh on-chain check (~line 3174)**

- After fresh `previewTransfer()` call, re-reads `balance` and `totalDebit` from chain
- If `balance < totalDebit`: sets status, `return` — no receipt is created
- `storeReceipt()` is called at ~line 3194, which is after this guard

**Balance fetch failure path**

- If `refreshUsdcBalance()` fails (RPC error): `state.usdcBalanceRaw = null`
- `buildDraftSummary()`: `balanceKnown: false`, `insufficientBalance: false`
- `updatePreview()` hits the `!summary.balanceKnown` branch: button set to "Checking Balance"
  (disabled) — not a false pass

**Button disablement**

- `setDraftButton(label, disabled=true)` sets native `els.txBtn.disabled = true`
- Click events are natively blocked — no JS handler fires

Code review verdict: handling is correct. No bugs found. Manual smoke validates UX presentation.

---

## Setup

- Wallet: MetaMask injected, Polygon mainnet
- Gate: `transfersEnabled` opened for test session, closed before commit
- Wallet USDC balance: note actual balance before test
- Amount to enter: any value greater than (balance − fee), e.g. if balance is 5.00 USDC, enter 5.00 USDC (total debit would be 5.05 USDC)

Note: total debit = amount + fee (1%). To trigger insufficient balance with amount X, the
wallet must hold less than X × 1.01 USDC.

---

## Procedure

1. Connect MetaMask on Polygon mainnet
2. Note the displayed USDC balance
3. Enter a valid recipient address
4. Enter an amount such that total debit exceeds available balance
5. Observe live preview behavior (no button click needed)
6. Attempt to check the acknowledgement checkbox if it appears
7. Attempt to click the button if it appears enabled
8. Open DevTools console and run the checks below

---

## Expected behavior

| Signal | Expected |
|--------|----------|
| Live preview label | "Transfer Blocked" |
| Preview mode | "Blocked" |
| Preview note | Shows have/need amounts |
| Status bar | "Insufficient balance. Have X USDC, need Y USDC." |
| Transfer note | "Lower the amount or add USDC before reviewing this transfer." |
| Acknowledgement checkbox | Hidden or absent (resetReviewAcknowledgement called) |
| Button label | "Insufficient Balance" |
| Button state | Disabled (unclickable) |
| Wallet prompt | None |

---

## Console checks

```js
// No active receipt should exist
window.IX?.receipts?.getActive?.()
// → null

// Receipt store should have no new pending entries
Object.keys(localStorage).filter(k => k.includes('receipt'))
// → [] or ['ix.receipt.archive'] with no new entry since before the test
```

---

## Pass criteria

| Criterion | Result |
|-----------|--------|
| Button disabled with "Insufficient Balance" label | |
| No wallet prompt appears | |
| Preview shows "Transfer Blocked" with have/need amounts | |
| Status bar shows have/need message | |
| Ack checkbox absent or unchecked | |
| No active receipt created | |
| No new pending receipt in archive | |
| Lower the amount → preview recovers correctly if balance now sufficient | |
| Refresh/reconnect → no ghost active receipt | |

---

## Post-test console log (fill in after test)

```js
window.IX?.receipts?.getActive?.()
```

```
// Paste result here
```

```js
Object.keys(localStorage).filter(k => k.includes('receipt'))
```

```
// Paste result here
```

---

## Gate discipline

- `transfersEnabled` must be opened for test session and closed before commit
- Verify: all three `transfersEnabled` flags `false` before commit
- Static check: 219/219 pass (pre-test)
- Observability suite: 31/31 pass (pre-test)

---

## Verdict

PENDING — awaiting manual wallet test.

Pre-test code review: three-layer defense is correct. No bugs found. Layer 1 (live preview)
blocks before any review state is entered. Layer 3 (submitTransfer on-chain recheck) provides
a final hard stop even if the UI guard is somehow bypassed. Receipt is created only after
the Layer 3 balance check passes.
