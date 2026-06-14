# Failure Path 4 — Insufficient Balance

**Date:** 2026-06-13
**Branch:** gate3-production-frontend-qa
**Outcome:** PASS

---

## Test scope

Verify that attempting a transfer that exceeds the sender's USDC balance produces a clear,
honest block **before any wallet prompt is triggered** — with no receipt created, no stale
success state, and a message that tells the user exactly what to fix.

This path tests the pre-execution balance guard in `updatePreview()` (wallet.js ~1680).
The block must occur before the Execute Transfer button is armed, before `runPreflight()` runs,
and before the wallet is ever contacted.

---

## How the block works (code path for reference)

1. On valid recipient + amount input, `updatePreview()` calls `buildOffChainPreviewSummary()`.
2. `buildOffChainPreviewSummary()` computes `totalDebit = rawAmount + fee` and compares
   to `state.usdcBalanceRaw` (fetched from `balanceOf()` on wallet connect).
3. If `balance < totalDebit`, `insufficientBalance: true` is set on the summary.
4. `updatePreview()` detects `insufficientBalance: true` and:
   - Renders the preview in `'Blocked'` mode ("Transfer Blocked")
   - Sets status bar: `"Insufficient balance. Have X USDC, need Y USDC."`
   - Sets transfer note: `"Lower the amount or add USDC before reviewing this transfer."`
   - Calls `setDraftButton('Insufficient Balance', true)` — button disabled, grayed
   - Calls `resetReviewAcknowledgement()` — ack checkbox cleared
5. The button never becomes armed. No wallet prompt. No receipt created.

A secondary catch exists in `runPreflight()` (verdict `INSUFFICIENT_BALANCE`) but should
not be reachable in this scenario because the button is already disabled.

---

## Setup

- Wallet: MetaMask injected, Polygon mainnet
- Gate: `transfersEnabled` opened for test session, closed before commit
- Recipient: `0xe0B02A6d9738aa36eE48004211E264b7a815796B`
- Amount: 8.17 USDC (balance + 1)

---

## Procedure

1. Connect MetaMask on Polygon mainnet.
2. Enter a valid recipient address.
3. Enter an amount that exceeds your USDC balance (including the 1% fee).
4. Observe the preview — it should render in "Transfer Blocked" mode immediately.
5. Observe the Execute Transfer button — it should read "Insufficient Balance" and be disabled.
6. Observe the status bar and transfer note.
7. Attempt to check the acknowledgement checkbox — it should be unchecked/disabled.
8. Confirm no wallet prompt ever appears.
9. Run console checks below.
10. Lower the entered amount to a valid value and confirm the block clears cleanly.

---

## Expected behavior

| Signal | Expected |
|--------|----------|
| Preview mode | "Transfer Blocked" |
| Preview note | "Increase USDC balance or lower amount before review. Have X USDC, need Y USDC." |
| Status bar | "Insufficient balance. Have X USDC, need Y USDC." (actual values) |
| Transfer note | "Lower the amount or add USDC before reviewing this transfer." |
| Button label | "Insufficient Balance" |
| Button state | Disabled (grayed, not clickable) |
| Acknowledgement checkbox | Cleared / not checkable |
| Wallet prompt | Never triggered |
| Receipt created | No |
| Active receipt | None |

---

## Console checks

```js
// No active receipt should exist
window.IX?.receipts?.getActive?.()
// → null

// No receipt archive should have been touched for this attempt
Object.keys(localStorage).filter(k => k.includes('receipt'))
// → [] or ['ix.receipt.archive'] from a prior session — no new entry
```

If `ix.receipt.archive` exists from a prior test session, confirm the most recent entry
is NOT from this test attempt (check the `id` timestamp).

---

## Recovery check

After observing the block, amount was lowered to 1.0 USDC:

| Signal | Expected | Observed |
|--------|----------|----------|
| Preview mode | Returns to normal (amount + fee + total debit) | PASS |
| Button | Returns to "Execute Transfer", re-enables when ack is checked | PASS |
| Status bar | Clears (no stale "insufficient balance" message) | PASS |
| Transfer note | Returns to normal | PASS |

Block is stateless — no residue carried forward to subsequent valid attempt.

---

## Pass criteria

| Criterion | Result |
|-----------|--------|
| Button never arms — "Insufficient Balance" label, disabled | PASS |
| No wallet prompt triggered at any point | PASS |
| No receipt created | PASS |
| `getActive()` → null | PASS |
| Status bar shows exact have/need amounts | PASS |
| Preview renders in Blocked mode, not a generic error screen | PASS |
| Acknowledgement checkbox cleared | PASS |
| After lowering amount: block clears, form returns to normal | PASS |

---

## Evidence

**Sender balance:** 7.17 USDC
**Entered amount:** 8.17 USDC
**Total debit at 1% fee:** 8.2517 USDC

**Status bar text observed:**
```
Insufficient balance. Have 7.17 USDC, need 8.25 USDC.
```

**Preview note observed:**
```
Increase USDC balance or lower amount before review. Have 7.17 USDC, need 8.25 USDC.
```

**Console output — getActive():**
```js
null
```

**Console output — localStorage keys:**
```js
// No new receipt entry created for this test attempt
```

**Recovery check — amount lowered to 1.0 USDC. Block cleared? (Y/N):** Y

---

## Gate discipline

- `transfersEnabled` opened for test session, closed before commit — verified
- All three `transfersEnabled` flags confirmed `false` before commit
- Static check and observability suite passed before commit

---

## Verdict

PASS — 2026-06-13

Pre-execution balance guard confirmed. App blocks on insufficient balance before wallet
contact, receipt creation, or any pending/success state. Human-readable exact amounts
shown ("Have 7.17 USDC, need 8.25 USDC"). Recovery to valid amount is clean and stateless.
No code fix required. Behavior is correct.
