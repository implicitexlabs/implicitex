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
SUBMITTED, OUTCOME_UNKNOWN, and UNCLEAR receipts survive page refresh, wallet
disconnect, and RPC failure. They are the most important receipts to preserve
because their outcome is unresolved.

**2. Rehydration re-queries the chain, not the stored state.**
On page load, if an active hash-bearing receipt exists with a non-terminal
state, the interface displays the stored evidence immediately, then queries the
chain for the transaction hash. Stored state is a starting point, not a
conclusion.

**3. The archive is bounded and silent.**
Maximum 20 archived receipts. Oldest dropped when limit is reached.
Archive is never displayed by default — it is accessible but not foregrounded.

**4. One active receipt at a time.**
The store tracks one current reading. If a new transaction begins while an
active receipt exists in a non-terminal state, that prior receipt is moved
to archive first as recoverable uncertainty if still unresolved. Hash-bearing
receipts preserve their hash/explorer evidence for verification.

**5. No fabricated state.**
The store never writes a terminal state it cannot confirm. If hash-bearing
re-query fails, the state remains recoverable uncertainty — SUBMITTED or
OUTCOME_UNKNOWN — not FAILED, not EXPIRED.

**6. Hash evidence is durable.**
Once a transfer hash exists, the receipt must preserve the hash and explorer URL.
Hash-bearing receipts must never imply safe retry until the explorer or chain
query verifies the outcome.

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
  "id":               "string — unique local identifier",
  "createdAt":        "string — ISO 8601, UTC, moment the attempt was recorded",
  "timestamp":        "string — legacy alias for createdAt",
  "resolvedAt":       "string | null — ISO 8601, UTC, moment of terminal state",
  "chainId":          "number",
  "sender":           "string | null — 0x checksummed address",
  "recipient":        "string | null — 0x checksummed address",
  "amount":           "string — USDC, human-readable (e.g. '100.000000')",
  "fee":              "string — USDC, human-readable (e.g. '1.000000')",
  "totalDebit":       "string — USDC, human-readable amount + fee",
  "contractAddress":  "string — ImplicitEx transfer contract address",
  "approvalHash":     "string | null — approval tx hash, if one was broadcast",
  "transferHash":     "string | null — transfer tx hash, if one was broadcast",
  "hash":             "string | null — legacy alias for transferHash",
  "state":            "string — from canonical state vocabulary",
  "fundsMoved":       "boolean | null — null means unknown or pre-terminal",
  "explorerUrl":      "string | null — full URL to block explorer tx page",
  "lastKnownMessage": "string — last factual status message",
  "network":          "string — chain name (e.g. 'Polygon')"
}
```

### fundsMoved values

| Value | Meaning |
|---|---|
| `true` | On-chain confirmation received. Funds transferred. CONFIRMED only. |
| `false` | Terminal non-transfer state confirmed. Funds did not move. |
| `null` | State is pre-terminal, SUBMITTED, OUTCOME_UNKNOWN, or UNCLEAR. Do not assume. |

---

## Receipt Lifecycle

```
[valid transfer attempt submitted]
        │
        ▼
   READY — receipt written to ix.receipt.active
   state: READY, approvalHash: null, transferHash: null
        │
        ▼
   AUTHORIZING — approval requested, if allowance is insufficient
        │
        ▼
   AUTHORIZED — approval confirmed or existing allowance sufficient
        │
        ▼
   SUBMITTING — transfer confirmation requested
        │
        ▼
   SUBMITTED — transferHash populated on network submission
        │
        ├──► [re-query: tx found, succeeded]  → CONFIRMED  (fundsMoved: true)
        ├──► [re-query: tx found, reverted]   → FAILED     (fundsMoved: false)
        ├──► [re-query: tx not found]          → SUBMITTED or OUTCOME_UNKNOWN (fundsMoved: null)
        ├──► [RPC/provider visibility failed]  → OUTCOME_UNKNOWN (fundsMoved: null)
        ├──► [wallet rejected before broadcast] → REJECTED (fundsMoved: false)
        └──► [no reliable hash/evidence]        → UNCLEAR  (fundsMoved: null)

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
4. If exists and state is non-terminal:
   a. Display stored receipt in companion immediately (do not wait for re-query)
   b. If no transferHash exists and state is DRAFT, READY, AUTHORIZING, or AUTHORIZED,
      show the local state and do not query chain
   c. If transferHash exists → preserve hash/explorer evidence and query chain
      - Confirmed on-chain → update to CONFIRMED, fundsMoved: true
      - Reverted on-chain  → update to FAILED, fundsMoved: false
      - Not found          → keep SUBMITTED or OUTCOME_UNKNOWN, prompt explorer check
      - RPC error          → update to OUTCOME_UNKNOWN, prompt explorer check
   d. Auto-open companion tray (rehydrated active receipt is high-priority)
```

### Rehydration companion message (before re-query resolves)

```
Status:      Submitted / Outcome unknown
Funds Moved: Unknown — checking network
Network:     [stored network name]
Last Event:  [stored transfer hash]
Next Step:   Checking transaction status. Do not retry yet.
```

---

## UNCLEAR Transition Rules

A receipt transitions to UNCLEAR when:

- No reliable transfer hash exists and the local state is not safely
  classifiable as pre-broadcast
- The app has insufficient evidence to determine whether a network transaction
  exists

A receipt does NOT transition to UNCLEAR when:

- The user cancelled in wallet (that is REJECTED — known outcome)
- The transaction reverted on-chain (that is FAILED — known outcome)
- A transfer hash exists (that is SUBMITTED or OUTCOME_UNKNOWN until reconciled)
- The companion tray is simply not open (visibility is irrelevant to state)

## OUTCOME_UNKNOWN Transition Rules

A receipt transitions to OUTCOME_UNKNOWN when:

- A transfer hash exists and local confirmation visibility fails
- RPC query errors without returning a status for a hash-bearing receipt
- Provider wait fails after the SUBMITTED hash was durably written
- Page reload, wallet disconnect, or runtime interruption loses local
  confirmation visibility after broadcast evidence exists

OUTCOME_UNKNOWN remains active and re-queriable. It must preserve `transferHash`,
`hash`, and `explorerUrl` when available. It must direct the user to explorer
verification before retrying.

### Re-query timeout threshold (Polygon Amoy)

Polygon Amoy target block time is ~2 seconds. A transaction not confirmed
within 3 minutes (90 blocks) after submission should remain hash-bearing
uncertainty and be re-queried or verified in the explorer. This threshold is
configurable per chain in `config/chains.js` as `confirmationTimeoutMs`.

---

## Expiration Policy

| Receipt state | Retention |
|---|---|
| Active, non-terminal | Indefinite — never expired while unresolved |
| Archived, terminal | Last 20 entries, oldest dropped at limit |

No time-based expiration. A receipt from 30 days ago that was SUBMITTED,
OUTCOME_UNKNOWN, or UNCLEAR when the page closed keeps that recoverable state
when it reopens. Hash-bearing receipts warrant chain re-query or explorer
verification, not silent deletion.

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
  create(detail),       // create active receipt, returns stored receipt
  update(id, patch),    // update fields on active receipt when id matches
  clearActive(),        // move active receipt to archive
  getActive(),          // returns active receipt or null
  listRecent(),         // returns archived receipts array
  listAll(),            // returns active receipt followed by archive
}
```

`wallet.js` calls `create()` after valid transfer details and exact debit are
computed, then patches the receipt through approval and transfer states. Terminal
states are archived with `clearActive()`.

---

## Notes

**Why not IndexedDB?**
localStorage is synchronous and sufficient for single-receipt active state.
The archive is small (max 20 entries). IndexedDB adds complexity without benefit
at this scale. Migrate if receipts grow significantly in size or quantity.

**Why not sessionStorage?**
sessionStorage is cleared on tab close. That defeats the primary purpose of
persistence — surviving unintended interruptions. Recoverable states such as
SUBMITTED, OUTCOME_UNKNOWN, and UNCLEAR would be lost exactly when they matter
most.
