# Failure Path 6 — RPC Failure / Provider Interruption

**Date:** 2026-06-11
**Branch:** gate3-negative-path-proof
**Outcome:** PENDING — manual wallet test required

---

## Test scope

Verify that provider failures — including loss of network connectivity, unresponsive RPC,
or provider going stale — produce recoverable, honest state at every phase of the flow.

RPC failures are distinguished from wallet rejections (FP1/FP2) and wallet-busy (FP3):
- FP1/FP2/FP3: wallet responds, user or MetaMask makes a decision
- FP6: the transport layer fails — no response arrives, or an error that is neither
  user-rejection nor wallet-busy

---

## Code review (2026-06-11)

**Pre-receipt phase — four guarded early-return paths in submitTransfer():**

All of these fire before `storeReceipt()` at ~line 3194. No receipt is created on failure.

| Guard | Failure message |
|-------|----------------|
| `eth_chainId` fails (~line 3028) | "Could not read chain ID from wallet." |
| `syncProviderAccounts()` fails (~line 3073) | "Could not verify connected sender before wallet action." |
| Signer acquisition fails (~line 3099) | "Could not get wallet signer. Is your wallet unlocked?" |
| `previewTransfer` / contract calls fail (~line 3128) | "Could not refresh contract preview data. Is the contract deployed and reachable?" |

All return early. Form is re-enabled via the `finally` block. No receipt created.

**Balance fetch failure (refreshUsdcBalance, ~line 2929)**

First RPC attempt fails → `state.usdcBalanceRaw = null` → `updatePreview()` → `balanceKnown: false`
→ button disabled as "Checking Balance". One retry after 4 seconds. If retry fails:
`resetBalanceDisplay('Balance unavailable')`. Transfer cannot be initiated.

**During approval — non-rejection network errors (~line 3307)**

`classifyTransferError(err, { phase: 'authorization', broadcastKnown: false })` — catches all
errors that are not 4001 (rejection) or -32002 (wallet busy). Network errors fall through
to `UNKNOWN_ERROR` if unclassified, or to named error codes for known patterns.
Result: receipt → `INTERRUPTED`, `fundsMoved: false`. `finally` re-enables form.

**Post-broadcast (~line 3455)**

If `txBroadcast = true` and `tx.wait()` throws: routes to OUTCOME_UNKNOWN.
`fundsMoved: null`, broadcast hash preserved. User directed to explorer.

Code review verdict: handling is correct. Provider failures are well-contained at every
phase. No receipt is created during pre-flight failures. Post-creation failures terminate
to honest terminal states.

---

## Setup

**Option A — Simulated: DevTools offline mode**
Use Chrome DevTools → Network → Offline to cut connectivity at specific moments.

**Option B — Simulated: DevTools request blocking**
Use DevTools → Network → request blocking to target specific RPC domains
(e.g. `polygon-rpc.com` or `infura.io`).

**Option C — Natural: poor connectivity / mobile tethering**
Use a flaky mobile connection and attempt transfers.

---

## Sub-scenario A — Balance fetch fails on connect (network offline at load or connect)

### Procedure

1. Open DevTools → Network → set to Offline
2. Connect MetaMask (or set to offline after connecting)
3. Observe USDC balance display
4. Re-enter valid recipient + amount
5. Observe button state

### Expected behavior

| Signal | Expected |
|--------|----------|
| USDC balance display | "Balance unavailable" or "Checking…" |
| Button | Disabled — "Checking Balance" |
| Wallet prompt | None |
| Receipt created | No |

---

## Sub-scenario B — previewTransfer fails at submit time

This simulates RPC failure AFTER the user clicks Execute Transfer but BEFORE the
receipt is created or any wallet prompt appears.

### Procedure

1. Connect MetaMask on Polygon mainnet, ensure balance is visible
2. Enter valid recipient + 1 USDC, check acknowledgement, arm the button
3. Set DevTools to Offline (or block `polygon-rpc.com`)
4. Click Execute Transfer

### Expected behavior

| Signal | Expected |
|--------|----------|
| Status bar | "Could not refresh contract preview data. Is the contract deployed and reachable?" |
| Wallet prompt | None |
| Receipt created | No |
| Form | Re-enabled for editing |

### Console checks

```js
window.IX?.receipts?.getActive?.()
// → null (no receipt created)

Object.keys(localStorage).filter(k => k.includes('receipt'))
// → [] or unchanged archive
```

---

## Sub-scenario C — Provider fails mid-approval (network cut during approval wait)

This requires cutting connectivity after MetaMask shows the approval prompt (or after
clicking approve in MetaMask) but before `approveTx.wait()` resolves.

### Procedure

1. Connect MetaMask on Polygon mainnet
2. Enter valid recipient + 1 USDC, check acknowledgement, click Execute Transfer
3. MetaMask approval prompt appears
4. Cut connectivity (DevTools Offline) while the approval confirmation is still pending
5. If MetaMask allows, approve the transaction (it may queue for later broadcast)
6. Observe app behavior when `approveTx.wait()` times out or throws

### Expected behavior

| Signal | Expected |
|--------|----------|
| Status bar | Error message from classifyTransferError (e.g. "Transfer could not continue") |
| Companion | Opens — interrupted state |
| Receipt state | `interrupted` or `failed` |
| fundsMoved | `false` |
| approvalHash | May be present if MetaMask had already submitted the tx |
| transferHash | `null` |
| Form | Re-enabled for editing |

### Console checks

```js
const r = JSON.parse(localStorage.getItem('ix.receipt.archive'))[0];
({
  state:        r.state,          // 'interrupted' or 'failed'
  fundsMoved:   r.fundsMoved,     // false
  approvalHash: r.approvalHash,   // null or present
  transferHash: r.transferHash,   // null
})
```

---

## Pass criteria

| Criterion | Sub-A | Sub-B | Sub-C |
|-----------|-------|-------|-------|
| Button disabled when balance unavailable | Required | — | — |
| No wallet prompt on previewTransfer failure | — | Required | — |
| No receipt created on pre-flight failure | Required | Required | — |
| Status message shown (not silent) | Required | Required | Required |
| Form re-enabled after failure | — | Required | Required |
| Receipt terminates to honest state | — | — | Required |
| `fundsMoved: false` | — | — | Required |
| No active receipt after failure | Required | Required | Required |

---

## Post-test console log (fill in after test)

```js
// Sub-scenario B result:
window.IX?.receipts?.getActive?.()
```

```
// Paste result here
```

```js
// Sub-scenario C result:
const r = JSON.parse(localStorage.getItem('ix.receipt.archive'))[0];
({
  state:        r.state,
  fundsMoved:   r.fundsMoved,
  approvalHash: r.approvalHash,
  transferHash: r.transferHash,
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

Pre-test code review: provider failures are correctly contained at every phase. Four
early-return guards protect against pre-flight failures with no receipt creation. Post-
creation failures classify via `classifyTransferError()` and terminate to honest states.
`fundsMoved` is always set conservatively. No bugs found.
