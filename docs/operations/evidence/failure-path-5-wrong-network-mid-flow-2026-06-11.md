# Failure Path 5 — Wrong Network Mid-Flow

**Date:** 2026-06-11
**Branch:** gate3-negative-path-proof
**Outcome:** PENDING — manual wallet test required

---

## Test scope

Verify that switching wallet network mid-flow (before, during, or between wallet prompts)
produces honest, safe state: no false authorization, no stuck UI, no misleading receipt state.

Chain changes are one of the most common real-world interruptions. MetaMask fires a
`chainChanged` event which the app must catch at every async checkpoint.

---

## Code review (2026-06-11)

Four enforcement layers found:

**Layer 1 — Live preview (updatePreview, ~line 1646)**

`validNetwork = state.connected && isConfiguredChain(state.chainId)`. If false: form hides,
button disabled, ack reset. Transfer cannot be submitted while on wrong network.

**Layer 2 — handleActiveProviderChainChanged (~line 112)**

Fires on MetaMask `chainChanged` event. Sets `activeFlowId = null`. Calls
`applyCurrentNetworkPresentation()` which resets the UI to the correct network state.
This happens regardless of whether a flow is in progress.

**Layer 3 — assertFlowActive() (~line 2980, called at lines 3249 and 3344)**

`assertFlowActive()` throws `FLOW_INVALIDATED` if `activeFlowId` was cleared (by a chain
or account change). It is called at two critical checkpoints:
- After `approveTx.wait()` resolves (line 3249) — between approval and transfer
- Just before `transferWithFee()` call (line 3344) — final pre-broadcast gate

If thrown, the outer catch sets receipt to `INTERRUPTED`, `fundsMoved: false`.
UI is not updated by the catch — the chain change handler already reset it.

**Layer 4 — submitTransfer() fresh chain re-read (~line 3028)**

At submit time, the provider is asked for `eth_chainId` directly (not just `state.chainId`).
If the chain is not a live transfer chain: status message shown, `return` before any action.

**Post-broadcast edge case**

`assertFlowActive()` is NOT called inside the transfer broadcast try-block (lines 3375–3451).
If a chain change occurs AFTER `transferWithFee()` is called but BEFORE `tx.wait()` resolves,
the tx.wait() error routes to OUTCOME_UNKNOWN with the broadcast hash preserved — correct,
because we cannot assert whether funds moved.

Code review verdict: handling is correct. No bugs found. INTERRUPTED vs OUTCOME_UNKNOWN
split correctly tracks whether the broadcast occurred.

---

## Setup

- Wallet: MetaMask injected, Polygon mainnet
- Gate: `transfersEnabled` opened for test session, closed before commit
- Second network available for mid-flow switch (e.g. Ethereum mainnet, or any non-Polygon chain)
- Recipient: `0xe0B02A6d9738aa36eE48004211E264b7a815796B`
- Amount: 1 USDC

---

## Sub-scenario A — Switch network BEFORE clicking Execute Transfer

### Procedure

1. Connect MetaMask on Polygon mainnet
2. Enter valid recipient + 1 USDC amount
3. Observe live preview (should show Transfer Preview with armed button)
4. In MetaMask, switch to a different network (e.g. Ethereum mainnet)
5. Observe form state — do not click anything

### Expected behavior

| Signal | Expected |
|--------|----------|
| Live preview | Hides or shows "Switch to Polygon" |
| Button | Disabled ("Switch to Polygon" or disabled state) |
| Status bar | Wrong-network message or clear |
| Acknowledgement | Reset/hidden |
| Wallet prompt | None |
| Receipt created | No |

---

## Sub-scenario B — Switch network DURING approval wait

This requires switching network after clicking Execute Transfer but before approving in MetaMask.

### Procedure

1. Connect MetaMask on Polygon mainnet
2. Enter valid recipient + 1 USDC, check acknowledgement, click Execute Transfer
3. MetaMask approval prompt appears — do NOT approve
4. In MetaMask, switch to a different network while the approval prompt is visible
5. Observe app behavior after the network change fires

### Expected behavior

| Signal | Expected |
|--------|----------|
| UI | Resets to wrong-network state (from chain change handler) |
| Flow | FLOW_INVALIDATED — assertFlowActive() throws after approveTx.wait() |
| Receipt state | `interrupted` |
| fundsMoved | `false` |
| approvalHash | `null` (approval never confirmed) |
| transferHash | `null` |
| Active receipt | None after resolve |
| Form | Re-enabled for editing |

Note: The approval prompt in MetaMask may still be actionable after the chain change.
If the user approves after switching chains, the app should still reach
`assertFlowActive()` after `approveTx.wait()` and invalidate the flow.

---

## Sub-scenario C — Switch network BETWEEN approval confirmed and transfer prompt

This requires an existing USDC allowance (from a prior approval), or triggering the
approval and letting it confirm, then switching chains before the transfer prompt.

### Procedure

1. Ensure existing USDC allowance ≥ 1.01 USDC, OR complete the approval step
2. After approval confirms (status shows "Step 2 of 2"), switch MetaMask network
3. Observe behavior before the transferWithFee prompt appears

### Expected behavior

| Signal | Expected |
|--------|----------|
| Receipt state | `interrupted` |
| fundsMoved | `false` |
| approvalHash | Present (approval completed before chain change) |
| transferHash | `null` (transfer never broadcast) |
| Active receipt | None after resolve |

The approval hash must be preserved even though the flow was interrupted. This is the
same `preserveKnown` behavior verified in FP2.

---

## Sub-scenario D — Switch network AFTER transfer broadcast (informational)

Post-broadcast chain changes route to OUTCOME_UNKNOWN, not INTERRUPTED.
This is correct: we cannot assert whether a broadcast transaction confirmed.

This scenario is difficult to reliably trigger. Document if observed; otherwise note
as covered by code review and OUTCOME_UNKNOWN rehydration path.

---

## Console checks (Sub-scenarios B and C)

```js
window.IX?.receipts?.getActive?.()
// → null

const r = JSON.parse(localStorage.getItem('ix.receipt.archive'))[0];
({
  state:        r.state,          // 'interrupted'
  fundsMoved:   r.fundsMoved,     // false
  approvalHash: r.approvalHash,   // null (B) or present (C)
  transferHash: r.transferHash,   // null
})
```

---

## Pass criteria

| Criterion | Sub-A | Sub-B | Sub-C |
|-----------|-------|-------|-------|
| Button disabled / wrong-network state before submit | Required | — | — |
| No wallet prompt on wrong network | Required | — | — |
| Flow invalidated after chain change mid-flow | — | Required | Required |
| Receipt state: `interrupted` | — | Required | Required |
| `fundsMoved: false` | — | Required | Required |
| No transfer hash | — | Required | Required |
| `approvalHash: null` | — | Required | — |
| `approvalHash` preserved | — | — | Required |
| Active receipt: none after resolve | — | Required | Required |
| Form re-enabled for editing | — | Required | Required |
| UI shows calm wrong-network state (not stuck/spinning) | Required | Required | Required |

---

## Post-test console log (fill in after test)

```js
// Sub-scenario B or C result:
const r = JSON.parse(localStorage.getItem('ix.receipt.archive'))[0];
({
  state:        r.state,
  fundsMoved:   r.fundsMoved,
  approvalHash: r.approvalHash,
  transferHash: r.transferHash,
  sender:       r.sender,
  recipient:    r.recipient,
  chainId:      r.chainId,
});
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

Pre-test code review: four-layer defense is correct. UI blocks on wrong network before
any action. Chain change event invalidates running flows via assertFlowActive(). Post-
broadcast chain changes correctly route to OUTCOME_UNKNOWN rather than INTERRUPTED.
No bugs found.
