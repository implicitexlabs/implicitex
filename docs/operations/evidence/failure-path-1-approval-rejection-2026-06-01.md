# Failure Path 1 — Approval Rejection

**Date:** 2026-06-01
**Branch:** failure-path-validation
**Outcome:** PASS

---

## Test scope

Verify that rejecting the USDC approval / spending-cap prompt in MetaMask
produces a safe, honest failure state with no funds moved and no misleading UI.

## Setup

- Wallet: MetaMask injected, Polygon mainnet
- Sender: (connected wallet)
- Recipient: `0xe0B02A6d9738aa36eE48004211E264b7a815796B`
- Amount: 1 USDC
- Gate: `transfersEnabled` opened for test session, closed before commit

## Procedure

1. Connect MetaMask on Polygon mainnet
2. Enter recipient and amount (1 USDC)
3. Check acknowledgement checkbox
4. Click Execute Transfer
5. MetaMask spending-cap / USDC approval prompt appears
6. Click **Reject**

## MetaMask error observed

```
code: 4001
message: "MetaMask Tx Signature: User denied transaction signature."
```

## Console checks after rejection

```js
window.IX?.receipts?.getActive?.()
// → null
```

```js
Object.keys(localStorage).filter(k => k.includes("receipt"))
// → ["ix.receipt.archive"]
```

```js
JSON.parse(localStorage.getItem('ix.receipt.archive'))[0]
// → {
//     schemaVersion: "receipt.v1",
//     id: "2026-06-01T23:34:31.957Z-881e4555",
//     state: "rejected",
//     fundsMoved: false,
//     sender: null,
//     recipient: null,
//     amount: null,
//     fee: null,
//     totalDebit: null,
//     chainId: null,
//     ...
//   }
```

## Pass criteria — results

| Criterion | Result |
|-----------|--------|
| No funds moved | PASS — `fundsMoved: false` |
| No transfer hash recorded | PASS — no `transferHash` in receipt |
| No approval hash recorded | PASS — no `approvalHash` in receipt |
| Receipt state does not claim success | PASS — `state: "rejected"` |
| No active receipt in localStorage | PASS — `getActive()` → `null` |
| Archive receipt exists with correct state | PASS — `ix.receipt.archive[0].state: "rejected"` |
| No uncaught runtime error in console | PASS — MetaMask 4001 is a handled rejection, not an uncaught error |

UI state after rejection (not captured in screenshot, observed during test):
- Status message: "Authorization declined. No funds moved."
- Companion tray opened automatically with rejected/no-funds state
- Acknowledgement checkbox unchecked
- Form inputs re-enabled
- Button returned to disabled/safe state

## Observed nuance

Transaction fields (`sender`, `recipient`, `amount`, `fee`, `totalDebit`, `chainId`) are `null`
in the archived rejected receipt. This is expected behavior: the rejection occurred before
the approval was confirmed, so no on-chain data was collected. The receipt correctly records
the outcome (`rejected`, `fundsMoved: false`) without fabricating field values.

This is a UX observation, not a safety failure. A future improvement could preserve the draft
recipient and amount in the receipt for user reference, but this is not a launch blocker.

## Console noise (not ImplicitEx errors)

The following were observed in the console and are browser/extension noise unrelated to ImplicitEx:

- `Layout was forced before the page was fully loaded` — browser rendering note
- `Window.fullScreen attribute is deprecated` — Firefox API deprecation
- `MaxListenersExceededWarning` — MetaMask extension internal event emitter
- `ObjectMultiplex - orphaned data for stream` — MetaMask extension internal routing

None of these originate from ImplicitEx code.

## Gate discipline

- `transfersEnabled` opened for test session: `true` (global + Polygon 137)
- Closed immediately after evidence capture, before commit
- Verified: all three `transfersEnabled` flags `false` before this commit
- Static check: 167/167 pass
- Observability suite: 8/8 pass

## Verdict

Failure Path 1 passes all safety criteria. The rejection path is honest, safe, and non-confusing.
The user who rejects the approval sees a clear failure state, retains control, and has no false
impression that a transfer occurred.
