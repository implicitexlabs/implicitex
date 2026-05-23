# ImplicitEx — Receipt Store

Defines the localStorage persistence layer for transaction receipts.
Runtime code is authoritative for machine behavior; this document explains the
storage model and invariants.

Related: `docs/product/transfer-observability.md`,
`docs/product/transaction-states.md`, `docs/product/companion-tray.md`

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
`submitted`, `outcome_unknown`, and `unclear` receipts survive page refresh, wallet
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
re-query fails, the state remains recoverable uncertainty: `submitted` or
`outcome_unknown`, not `failed`, not `expired`.

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
  "schemaVersion":    "string — local receipt schema version (e.g. 'receipt.v1')",
  "id":               "string — unique local identifier",
  "createdAt":        "string — ISO 8601, UTC, moment the attempt was recorded",
  "timestamp":        "string — legacy alias for createdAt",
  "updatedAt":        "string | null — ISO 8601, UTC, moment of last local update",
  "resolvedAt":       "string | null — ISO 8601, UTC, moment of terminal state",
  "observationSource": "string — latest source of receipt facts",
  "lastObservedAt":   "string | null — ISO 8601, UTC, moment latest source was stamped",
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
  "blockNumber":      "number | null — confirmation block when known",
  "state":            "string — from canonical state vocabulary",
  "fundsMoved":       "boolean | null — null means unknown or pre-terminal",
  "explorerUrl":      "string | null — full URL to block explorer tx page",
  "purposeTag":       "string — optional local/off-chain transfer purpose",
  "referenceId":      "string — optional local/off-chain invoice or internal reference",
  "memo":             "string — optional local/off-chain memo",
  "lastKnownMessage": "string — last factual status message",
  "network":          "string — chain name (e.g. 'Polygon')"
}
```

### fundsMoved values

| Value | Meaning |
|---|---|
| `true` | On-chain confirmation received. Funds transferred. `confirmed` only. |
| `false` | Terminal non-transfer state confirmed. Funds did not move. |
| `null` | State is pre-terminal, `submitted`, `outcome_unknown`, or `unclear`. Do not assume. |

---

## Receipt Lifecycle

```
[valid transfer attempt submitted]
        │
        ▼
   ready — receipt written to ix.receipt.active
   state: ready, approvalHash: null, transferHash: null
        │
        ▼
   authorizing — approval requested, if allowance is insufficient
        │
        ▼
   authorized — approval confirmed or existing allowance sufficient
        │
        ▼
   submitting — transfer confirmation requested
        │
        ▼
   submitted — transferHash populated on network submission
        │
        ├──► [re-query: tx found, succeeded]  → confirmed  (fundsMoved: true)
        ├──► [re-query: tx found, reverted]   → failed     (fundsMoved: false)
        ├──► [re-query: tx not found]          → submitted or outcome_unknown (fundsMoved: null)
        ├──► [RPC/provider visibility failed]  → outcome_unknown (fundsMoved: null)
        ├──► [wallet rejected before broadcast] → rejected (fundsMoved: false)
        └──► [no reliable hash/evidence]        → unclear  (fundsMoved: null)

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
2. If null → no active receipt, companion stays in idle `ready` state
3. If exists and state is terminal → move to archive, companion idle
4. If exists and state is non-terminal:
   a. Display stored receipt in companion immediately (do not wait for re-query)
   b. If no transferHash exists and state is `draft`, `ready`, `authorizing`, or `authorized`,
      show the local state and do not query chain
   c. If transferHash exists → preserve hash/explorer evidence and query chain
      - Confirmed on-chain → update to `confirmed`, fundsMoved: true
      - Reverted on-chain  → update to `failed`, fundsMoved: false
      - Not found          → keep `submitted` or `outcome_unknown`, prompt explorer check
      - RPC error          → update to `outcome_unknown`, prompt explorer check
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

## `unclear` Transition Rules

A receipt transitions to `unclear` when:

- No reliable transfer hash exists and the local state is not safely
  classifiable as pre-broadcast
- The app has insufficient evidence to determine whether a network transaction
  exists

A receipt does NOT transition to `unclear` when:

- The user cancelled in wallet (that is `rejected` — known outcome)
- The transaction reverted on-chain (that is `failed` — known outcome)
- A transfer hash exists (that is `submitted` or `outcome_unknown` until reconciled)
- The companion tray is simply not open (visibility is irrelevant to state)

## `outcome_unknown` Transition Rules

A receipt transitions to `outcome_unknown` when:

- A transfer hash exists and local confirmation visibility fails
- RPC query errors without returning a status for a hash-bearing receipt
- Provider wait fails after the `submitted` hash was durably written
- Page reload, wallet disconnect, or runtime interruption loses local
  confirmation visibility after broadcast evidence exists

`outcome_unknown` remains active and re-queriable. It must preserve `transferHash`,
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

No time-based expiration. A receipt from 30 days ago that was `submitted`,
`outcome_unknown`, or `unclear` when the page closed keeps that recoverable state
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
- Does not send purpose tags, references, or memos on-chain

## Schema Versioning

Local receipts are normalized through `app-web/frontend/public/js/receipt-schema.js`.
The current local receipt schema is `receipt.v1`.

Migration rules:

- Legacy uppercase states are normalized to lowercase canonical states.
- Missing `schemaVersion` is filled with `receipt.v1`.
- Missing `observationSource` is filled with `migration`.
- Missing `lastObservedAt` is filled from `updatedAt`, `resolvedAt`, `createdAt`, or `null`.
- Missing `purposeTag`, `referenceId`, and `memo` are filled with empty strings.
- Hash-only receipts preserve `hash` and copy it to `transferHash`.
- TransferHash-only receipts preserve `transferHash` and copy it to `hash`.
- Confirmed receipts normalize to `fundsMoved: true`.
- Submitted, pending, outcome-unknown, and unclear receipts normalize to `fundsMoved: null` unless a stronger confirmed fact already exists.
- Failed, rejected, expired, and pre-broadcast interrupted receipts normalize to `fundsMoved: false` unless a stronger confirmed fact already exists.
- Malformed receipts do not crash the store; known fields are normalized and missing fields receive defaults.

Non-weakening rules:

- Confirmed receipts cannot regress to weaker states.
- `fundsMoved: true` cannot become `null` or `false`.
- Known `blockNumber`, `transferHash`, `hash`, `explorerUrl`, and `createdAt` values are preserved when later observations omit them.
- Rehydration may enrich a receipt with stronger chain facts, but it may not overwrite stronger facts with uncertainty.
- Provenance explains where the latest observation came from; it does not decide state strength.

Observation sources:

- `local` — created locally by the browser app.
- `wallet` — observed from wallet action or wallet/provider response during the active transfer flow.
- `rpc` — observed from an RPC read or chain receipt during active reconciliation.
- `rehydration` — observed during reload-based receipt reconciliation.
- `migration` — assigned while normalizing legacy local records.
- `import` — reserved for future imported proof or receipt records.

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
`submitted`, `outcome_unknown`, and `unclear` would be lost exactly when they matter
most.
