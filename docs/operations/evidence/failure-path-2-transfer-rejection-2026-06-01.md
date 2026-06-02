# Failure Path 2 — Transfer Rejection (Approval Approved, Transfer Rejected)

**Date:** 2026-06-01
**Branch:** failure-path-validation
**Outcome:** PASS with bug found and fixed

---

## Test scope

Verify that approving the USDC allowance prompt but rejecting the subsequent
`transferWithFee` prompt produces a safe, honest failure state. This is the
"asymmetric" failure: approval cost gas, but USDC did not move.

## Setup

- Wallet: MetaMask injected, Polygon mainnet
- Recipient: `0xe0B02A6d9738aa36eE48004211E264b7a815796B`
- Amount: 1 USDC
- Gate: `transfersEnabled` opened for test session, closed before commit

## Procedure

1. Connect MetaMask on Polygon mainnet
2. Enter recipient and amount (1 USDC)
3. Check acknowledgement checkbox
4. Click Execute Transfer
5. MetaMask spending-cap / USDC approval prompt — **Approve**
6. Wait for approval confirmation
7. MetaMask `transferWithFee` execution prompt — **Reject**

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
//     id: "2026-06-01T23:49:09.649Z-bbb99388",
//     state: "rejected",
//     fundsMoved: false,
//     lastKnownMessage: "Transfer rejected in wallet. No transfer was broadcast.",
//     approvalHash: null,   ← BUG — see below
//     transferHash: null,
//     sender: null,         ← BUG — same root cause
//     recipient: null,
//     amount: null,
//     ...
//   }
```

## Safety pass criteria — results

| Criterion | Result |
|-----------|--------|
| No funds moved | PASS — `fundsMoved: false` |
| No transfer hash recorded | PASS — `transferHash: null` |
| Receipt state does not claim success | PASS — `state: "rejected"` |
| No active receipt in localStorage | PASS — `getActive()` → `null` |
| `lastKnownMessage` identifies transfer rejection | PASS — "Transfer rejected in wallet. No transfer was broadcast." |
| No uncaught runtime error | PASS |

**Core safety result: PASS.** No USDC moved. No false success state.

---

## Bug found: receipt field erasure on state update

**Symptom:** `approvalHash`, `sender`, `recipient`, `amount`, `fee`, `totalDebit`,
`chainId`, `network`, `contractAddress` all null in the archived receipt despite
being set at receipt creation.

**Root cause:** In `receipt-schema.js`, `mergeReceiptForward(existing, incoming)` does:

```js
const next = migrateReceipt(Object.assign({}, current, receiptObject(incoming)));
```

`migrateReceipt(rawPatch)` calls `normalizeKnownFields`, which fills every schema
field not present in the patch with its default value (`null`). The `Object.assign`
then lets those nulls overwrite known values from `current`.

The `preserveKnown` calls that follow restore specific fields (`transferHash`, `hash`,
`blockNumber`, `explorerUrl`, `createdAt`, `lastObservedAt`, `id`), but `approvalHash`,
`sender`, `recipient`, `amount`, `fee`, `totalDebit`, `chainId`, `network`, and
`contractAddress` were missing from that list.

**Fix applied:** `receipt-schema.js` — added missing fields to the `preserveKnown` list
in `mergeReceiptForward`. Fields are grouped by semantics:

- Structural identity: `id`, `createdAt`, `lastObservedAt`
- Transfer attempt facts: `sender`, `recipient`, `amount`, `fee`, `totalDebit`,
  `chainId`, `network`, `contractAddress`, `explorerUrl`
- On-chain hashes: `approvalHash`, `transferHash`, `hash`, `blockNumber`

**Verification:** 27/27 observability tests pass after fix. 167/167 static check passes.

**Impact:** This bug affected receipt data quality for any failure/rejection state that
followed a receipt with populated fields. It did not affect safety behavior —
`state: rejected` and `fundsMoved: false` were correctly preserved. But it erased useful
context (who sent what to whom) that users would expect to see in receipt history.

---

## Post-fix re-test (2026-06-02)

Re-tested Failure Path 2 after the `preserveKnown` fix. Approval allowance was zero
(consumed by an incidental confirmed transfer during the first re-test attempt), so
a fresh approval prompt appeared as expected.

```js
const r = JSON.parse(localStorage.getItem('ix.receipt.archive'))[0];
({
  state:        r.state,         // "rejected"
  fundsMoved:   r.fundsMoved,    // false
  approvalHash: r.approvalHash,  // "0x0e4299469440390d7a7d4033ed1809d123cd103474a6950b8a7c3490e63b37e2"
  transferHash: r.transferHash,  // null
  sender:       r.sender,        // "0x2489587c9da6eab970a5479ba70273ba37961221"
  recipient:    r.recipient,     // "0xe0B02A6d9738aa36eE48004211E264b7a815796B"
  amount:       r.amount,        // "1.0"
  fee:          r.fee,           // "0.01"
  totalDebit:   r.totalDebit,    // "1.01"
  chainId:      r.chainId        // 137
});
```

`getActive()` → `null`. localStorage receipt keys: `["ix.receipt.archive"]` only.

**All fields preserved.** The asymmetry is correctly recorded: approval completed
on-chain (`approvalHash` present), transfer was rejected (`transferHash` null),
no USDC moved (`fundsMoved: false`).

---

## Gate discipline

- `transfersEnabled` opened for test sessions, closed before every commit
- Verified: all three `transfersEnabled` flags `false` before this commit
- Static check: 167/167 pass
- Observability suite: 27/27 pass

## Verdict

Failure Path 2: CLOSED.
- Safety: PASS — no funds moved, no active receipt, no false success state
- Receipt integrity: PASS after `preserveKnown` fix — all transfer attempt fields preserved
- Bug found, fixed, and live-verified in same session
