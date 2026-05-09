# ImplicitEx — Receipt Store

Defines the localStorage persistence layer for transaction receipts.
Implementation conforms to this document. Wording and structure here are canonical.

Related: `docs/product/transaction-states.md`, `docs/product/companion-tray.md`

---

## Purpose

The receipt store exists to prevent a specific failure mode:

> The user submits a transaction. The page refreshes, the wallet disconnects,
> or the RPC fails. The interface has no memory of what happened. The user
> does not know whether to retry — and retrying a confirmed transfer sends twice.

Persistence converts the companion tray from a runtime display into a
continuity layer. A receipt that survives refresh is a receipt that can
answer "did funds move?" after an interruption.

---

## Governing Rules

**1. An active receipt is never discarded until its state is terminal.**
SUBMITTED and UNCLEAR receipts survive page refresh, wallet disconnect,
and RPC failure. They are the most important receipts to preserve because
their outcome is unresolved.

**2. Rehydration re-queries the chain, not the stored state.**
On page load, if an active receipt exists with a non-terminal state, the
interface queries the chain for the transaction hash before displaying anything.
Stored state is a starting point, not a conclusion.

**3. The archive is bounded and silent.**
Maximum 20 archived receipts. Oldest dropped when limit is reached.
Archive is never displayed by default — it is accessible but not foregrounded.

**4. One active receipt at a time.**
The store tracks one current reading. If a new transaction begins while an
active receipt exists in a non-terminal state, that prior receipt is moved
to archive first (marked UNCLEAR if still unresolved).

**5. No fabricated state.**
The store never writes a terminal state it cannot confirm. If re-query fails,
the state remains UNCLEAR — not FAILED, not EXPIRED.

---

## localStorage Keys

```
ix.receipt.active    — object | null   — the receipt currently being tracked
ix.receipt.archive   — array           — resolved receipts, newest first, max 20
```

Both keys are namespaced under `ix.receipt` to avoid collisions.

---

## Receipt Schema

```json
{
  "id":          "string — ISO timestamp at creation, used as stable identifier",
  "state":       "string — from canonical state vocabulary",
  "timestamp":   "string — ISO 8601, UTC, moment of first event",
  "resolvedAt":  "string | null — ISO 8601, UTC, moment of terminal state",
  "hash":        "string | null — 0x-prefixed tx hash, null until broadcast",
  "amount":      "string — USDC, human-readable (e.g. '100.000000')",
  "fee":         "string — USDC, human-readable (e.g. '1.000000')",
  "recipient":   "string | null — 0x checksummed address",
  "sender":      "string | null — 0x checksummed address",
  "network":     "string — chain name (e.g. 'Polygon Amoy')",
  "chainId":     "number",
  "explorerUrl": "string | null — full URL to block explorer tx page",
  "fundsMoved":  "boolean | null — null means unknown (UNCLEAR state)"
}
```

### fundsMoved values

| Value | Meaning |
|---|---|
| `true` | On-chain confirmation received. Funds transferred. |
| `false` | Terminal non-transfer state confirmed. Funds did not move. |
| `null` | State is UNCLEAR or pre-terminal. Do not assume. |

---

## Receipt Lifecycle

```
[transfer initiated]
        │
        ▼
   CREATED — receipt written to ix.receipt.active
   state: AWAITING_APPROVAL, hash: null
        │
        ▼
   BROADCAST — hash populated on network submission
   state: SUBMITTED
        │
        ├──► [re-query: tx found, succeeded]  → CONFIRMED  (fundsMoved: true)
        ├──► [re-query: tx found, reverted]   → FAILED     (fundsMoved: false)
        ├──► [re-query: tx not found, timeout] → UNCLEAR   (fundsMoved: null)
        ├──► [wallet rejected before broadcast] → REJECTED (fundsMoved: false)
        └──► [timeout without re-query result]  → UNCLEAR  (fundsMoved: null)

[terminal state reached]
        │
        ▼
   resolvedAt populated
   receipt moved from ix.receipt.active → ix.receipt.archive (prepended)
   ix.receipt.active set to null
   archive trimmed to max 20 entries
```

---

## Rehydration Rules

On every page load, the store module runs before companion state is set.

```
1. Read ix.receipt.active
2. If null → no active receipt, companion stays in idle READY state
3. If exists and state is terminal → move to archive, companion idle
4. If exists and state is non-terminal (SUBMITTED, AWAITING_APPROVAL, UNCLEAR):
   a. Display stored receipt in companion immediately (do not wait for re-query)
   b. Show state as UNCLEAR with fundsMoved: null
   c. If hash exists → query chain for receipt status
      - Confirmed on-chain → update to CONFIRMED, fundsMoved: true
      - Reverted on-chain  → update to FAILED, fundsMoved: false
      - Not found          → leave as UNCLEAR, prompt Polygonscan check
      - RPC error          → leave as UNCLEAR, note RPC unavailable
   d. Auto-open companion tray (rehydrated active receipt is high-priority)
```

### Rehydration companion message (before re-query resolves)

```
Status:      Unclear
Funds Moved: Unknown — checking network
Network:     [stored network name]
Last Event:  Transaction submitted [stored timestamp]
Next Step:   Checking transaction status. Do not retry yet.
```

---

## UNCLEAR Transition Rules

A receipt transitions to UNCLEAR when:

- Re-query for the hash returns null after the network's expected confirmation window
- RPC call errors without returning a status
- Page was closed or wallet disconnected while state was SUBMITTED or PENDING
  and no confirmation was received before the interruption

A receipt does NOT transition to UNCLEAR when:

- The user cancelled in wallet (that is REJECTED — known outcome)
- The transaction reverted on-chain (that is FAILED — known outcome)
- The companion tray is simply not open (visibility is irrelevant to state)

### UNCLEAR timeout threshold (Polygon Amoy)

Polygon Amoy target block time is ~2 seconds. A transaction not confirmed
within 3 minutes (90 blocks) after submission should be considered potentially
dropped and flagged UNCLEAR for re-query. This threshold is configurable per
chain in `config/chains.js` as `confirmationTimeoutMs`.

---

## Expiration Policy

| Receipt state | Retention |
|---|---|
| Active, non-terminal | Indefinite — never expired while unresolved |
| Archived, terminal | Last 20 entries, oldest dropped at limit |

No time-based expiration. A receipt from 30 days ago that was UNCLEAR
when the page closed is still UNCLEAR when it reopens — and still warrants
a re-query, not silent deletion.

---

## What the Store Does Not Do

- Does not display receipts directly (companion renders from store data)
- Does not fabricate terminal states from timeouts alone
- Does not delete active receipts on disconnect
- Does not limit receipt size by time — only by count (archive max 20)
- Does not sync across devices or sessions
- Does not transmit receipt data to any server

---

## Implementation Surface

The store will expose a module at `js/receipt-store.js`:

```javascript
window.IX.receipts = {
  begin(detail),        // create active receipt, returns id
  update(patch),        // update fields on active receipt
  resolve(state),       // mark terminal, move to archive
  getActive(),          // returns active receipt or null
  getArchive(),         // returns archived receipts array
  rehydrate(),          // run on page load — returns active receipt or null
}
```

`wallet.js` calls `begin()` when a transfer is initiated and `resolve()` when
a terminal state is reached. The companion reads from `getActive()` on rehydration.

---

## Notes

**Why not IndexedDB?**
localStorage is synchronous and sufficient for single-receipt active state.
The archive is small (max 20 entries). IndexedDB adds complexity without benefit
at this scale. Migrate if receipts grow significantly in size or quantity.

**Why not sessionStorage?**
sessionStorage is cleared on tab close. That defeats the primary purpose of
persistence — surviving unintended interruptions. The UNCLEAR state would be
lost exactly when it matters most.
