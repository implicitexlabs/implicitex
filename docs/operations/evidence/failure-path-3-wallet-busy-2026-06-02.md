# Failure Path 3 — Wallet Busy (-32002)

**Date:** 2026-06-02 / 2026-06-11
**Branch:** main / gate3-negative-path-proof
**Outcome:** PASS

---

## Test scope

Verify that a MetaMask `-32002` wallet-busy interruption — in either the approval phase or
the transfer phase — produces a safe, honest INTERRUPTED state with no funds moved and no
misleading UI.

This is distinct from FP1 (user rejects approval) and FP2 (user rejects transfer):
- FP1/FP2: user actively clicks Reject in MetaMask
- FP3: MetaMask cannot even present the prompt because another request is already pending

The `-32002` code is a deterministic, non-rejection interruption. No user decision is made.
No authorization occurs. No broadcast occurs. The correct state is `interrupted`,
not `rejected`.

---

## Pre-test fix applied (2026-06-02)

**Bug found:** Both `-32002` handlers in wallet.js called
`companionState(IX_TRANSFER_STATES.REJECTED, ...)` while setting the receipt state to
`INTERRUPTED`. This caused the telemetry panel to show "Rejected by wallet" (status/low
signal) instead of "Interrupted" (elevated/avg signal).

**Fix:** Both handlers updated to `companionState(IX_TRANSFER_STATES.INTERRUPTED, ...)`.
Receipt state, `fundsMoved`, and companion text were already correct.

**Tests added:** 4 new observability tests covering the `-32002` classifier path and
the INTERRUPTED state machine invariants. 31/31 pass.

---

## Setup

- Wallet: MetaMask injected, Polygon mainnet
- Gate: `transfersEnabled` opened for test session, closed before commit
- Recipient: `0xe0B02A6d9738aa36eE48004211E264b7a815796B`
- Amount: 1 USDC

---

## How to trigger -32002 (two options)

**Option A — Second pending request from another tab**
1. Open a second browser tab to any dapp that requires a MetaMask signature
2. Initiate a MetaMask signature or send request from that tab
3. When the MetaMask prompt appears, leave it open (do not approve or reject)
4. Switch back to the ImplicitEx tab
5. Proceed to Execute Transfer

**Option B — MetaMask's own send interface**
1. Open MetaMask
2. Click Send → fill in any amount/address → click Next
3. Leave the MetaMask send confirmation open without confirming or rejecting
4. Return to ImplicitEx tab
5. Proceed to Execute Transfer

In both cases, MetaMask should respond to the ImplicitEx `eth_sendTransaction` call
with error code `-32002`.

---

## Sub-scenario A — -32002 during the approval step

### Procedure

1. Connect MetaMask on Polygon mainnet
2. Create a pending MetaMask request (see setup above) — leave open
3. On ImplicitEx: enter recipient + amount (1 USDC), check acknowledgement, click Execute Transfer
4. MetaMask fires `eth_sendTransaction` for USDC approval
5. MetaMask responds with -32002 (wallet busy) rather than showing the approval prompt

### Expected behavior

| Signal | Expected |
|--------|----------|
| Status bar | "MetaMask already has a pending request. Open MetaMask and finish or cancel it, then retry." |
| Companion | Opens automatically — "Wallet request already pending in MetaMask." |
| Companion stateVal | "Interrupted" |
| Companion fundsVal | "No — nothing was sent" |
| Companion eventVal | "MetaMask already has a pending request (-32002)" |
| Companion actionVal | "Open MetaMask, finish or cancel the pending request, then retry." |
| Telemetry signal | elevated/avg — "Interrupted" |
| Form inputs | Re-enabled for editing |
| Button | Returns to disabled/ready state |

### Console checks

```js
window.IX?.receipts?.getActive?.()
// → null (receipt resolved and archived)

Object.keys(localStorage).filter(k => k.includes('receipt'))
// → ['ix.receipt.archive']

const r = JSON.parse(localStorage.getItem('ix.receipt.archive'))[0];
({
  state:        r.state,          // 'interrupted'
  fundsMoved:   r.fundsMoved,     // false
  approvalHash: r.approvalHash,   // null (approval never reached MetaMask)
  transferHash: r.transferHash,   // null
})
```

### Pass criteria

| Criterion | Result |
|-----------|--------|
| No funds moved | |
| `fundsMoved: false` in receipt | |
| No approval hash | |
| No transfer hash | |
| Receipt state: `interrupted` | |
| Active receipt: none | |
| Companion: auto-opened with correct copy | |
| Telemetry: elevated/avg signal | |
| Form: re-enabled and safe to retry | |

---

## Sub-scenario B — -32002 during the transfer step (approval already confirmed)

This requires the USDC allowance to already be sufficient (set by a prior approval),
or triggering -32002 after the approval prompt is shown but before the transfer prompt.

In practice this is harder to hit than Sub-scenario A. Test if possible.

### Expected behavior

| Signal | Expected |
|--------|----------|
| Receipt state | `interrupted` |
| fundsMoved | `false` |
| approvalHash | may be present if approval already completed |
| transferHash | `null` (transfer never broadcast) |
| Companion stateVal | "Interrupted" |
| Companion fundsVal | "No — nothing was sent" |
| Telemetry signal | elevated/avg — "Interrupted" |

The asymmetry is important: if the approval completed but the transfer prompt returned
-32002, the approval hash should be preserved in the receipt (same preservation
behavior as FP2 with the `preserveKnown` fix).

---

## Post-test console log (fill in after test)

```js
// Sub-scenario A result:
const r = JSON.parse(localStorage.getItem('ix.receipt.archive'))[0];
({
  state:        r.state,
  fundsMoved:   r.fundsMoved,
  approvalHash: r.approvalHash,
  transferHash: r.transferHash,
  sender:       r.sender,
  recipient:    r.recipient,
  amount:       r.amount,
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
- Observability suite: 31/31 pass (pre-test, includes new FP3 tests)

---

## Verdict

PASS — 2026-06-11, gate3-negative-path-proof branch.

**Method:** Option B — MetaMask native send confirmation left pending (POL send).

**Observed behavior:**
- Created pending MetaMask POL send confirmation, left open without confirming or rejecting.
- Clicked Execute Transfer on ImplicitEx.
- No second MetaMask confirmation appeared (wallet-busy condition intercepted).
- Acknowledgement checkbox automatically cleared.
- Execute Transfer returned to disabled state.
- Recipient address and amount preserved.
- No stuck processing state.
- No phantom transaction initiated.
- `window.IX?.receipts?.getActive?.()` → `null`.

**Recovery loop verified:**
- Canceled pending POL send in MetaMask.
- Re-checked acknowledgement box on ImplicitEx.
- Execute Transfer re-enabled without page reload or wallet reconnect.

**Note:** Sub-scenario B (−32002 during transfer step) was not separately triggered.
Sub-scenario A (−32002 during approval step) confirmed clean.

Pre-test code review: handling is correct. The `-32002` telemetry bug was found and fixed
(companionState state key corrected from REJECTED to INTERRUPTED). Observability tests added
and passing. 31/31 observability tests pass post-fix.
