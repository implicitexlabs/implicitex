# ImplicitEx — Transaction State Vocabulary

The canonical state machine for all transaction events. Every companion message,
receipt label, next-action suggestion, and storage key derives from this document.
Wording evolves here first. Code follows.

---

## Governing Rules

**1. "Funds Moved?" is always answered first.**
If the companion communicates nothing else, it answers that question.

**2. UNCLEAR is not a failure state. It is an epistemic state.**
The companion must not imply a transaction failed when the outcome is genuinely
unknown. Uncertainty and failure are different. Treating them as the same causes
users to retry transactions that may have already confirmed.

**3. AI never invents state.**
If an AI interpretation layer is added later, it annotates known state —
it does not classify it. The state machine is authoritative. The AI is explanatory.

**4. SUBMITTED and PENDING are distinct only when the provider gives evidence.**
If the RPC cannot distinguish mempool presence from initial broadcast, collapse
both into SUBMITTED. Do not fabricate state granularity that the provider cannot
confirm.

---

## State Table

| State | Meaning | Funds Moved? | User Action | Companion Message |
|---|---|---|---|---|
| `SUBMITTED` | Broadcast to network. Not yet included in a block. | No | Wait. Do not retry. | "Transaction submitted. Awaiting network confirmation. No funds have moved yet." |
| `PENDING` | Seen by network nodes. In mempool, awaiting mining. Only use when provider confirms mempool presence. | No | Wait. Do not retry. | "Transaction pending. The network is working. No funds have moved yet." |
| `CONFIRMED` | Included in a finalized block. On-chain record exists. | Yes | Review receipt. | "Transfer confirmed. Funds have moved. Receipt available on Polygonscan." |
| `REJECTED` | Cancelled in wallet before broadcast. Nothing reached the network. | No | Retry if intended, or do nothing. | "Transaction rejected in wallet. Nothing was sent. No funds moved." |
| `FAILED` | Reached the network. Included in a block. Execution reverted on-chain. | No — gas was consumed | Check reason. Correct inputs. Retry only if appropriate. | "Transaction failed on-chain. Transfer did not complete. Gas was consumed. Funds were not moved." |
| `UNCLEAR` | Submitted, but current status cannot be resolved. Cause: RPC failure, timeout, or network error. | Unknown — verify before retrying | Check Polygonscan. Do not retry without confirming current status. | "Transaction status is unclear. Check Polygonscan before retrying. Do not assume the transfer failed." |
| `EXPIRED` | Broadcast but dropped from mempool before mining. Cause: gas too low or network timeout. | No | Retry with adjusted gas, or wait for network conditions to improve. | "Transaction expired. Not processed by the network. No funds moved. Retry with higher gas if needed." |
| `REPLACED` | A later transaction with the same nonce was mined instead. Cause: speed-up or cancel action. | Depends on the replacement | Verify which transaction was mined on Polygonscan before proceeding. | "Transaction replaced by a later submission. Verify the outcome on Polygonscan before proceeding." |

---

## State Transition Map

```
[user initiates transfer]
        │
        ▼
    SUBMITTED
        │
        ├──► PENDING (if provider confirms mempool)
        │        │
        │        ▼
        ├──► CONFIRMED  ← terminal, positive
        ├──► FAILED     ← terminal, negative (reverted on-chain)
        ├──► EXPIRED    ← terminal, negative (dropped from mempool)
        ├──► REPLACED   ← terminal, ambiguous (check replacement)
        └──► UNCLEAR    ← non-terminal (re-query; may resolve to any terminal state)

[user cancels in wallet]
        │
        ▼
    REJECTED               ← terminal, pre-broadcast
```

---

## Companion Tone Rules

- No first-person language. Subject is always the transaction or the network.
- No emotional coloring. No apology, no celebration, no reassurance beyond fact.
- Present tense for current state. Past tense only in confirmed receipts.
- Do not speculate. If the state is UNCLEAR, the companion says it is unclear.
- Operational truth only. The companion reads like an instrument, not a voice.

**Correct:**
> "Transaction submitted. Awaiting network confirmation. No funds have moved yet."

**Incorrect:**
> "We're processing your transaction! Hang tight 🚀"

---

## Receipt Structure

Every transaction attempt — including failures — produces a receipt. Receipts are
archived when a terminal state is reached. The companion displays one current
reading at a time. Archive access is secondary and intentionally quieter.

Minimum receipt fields:

```
state:          CONFIRMED | FAILED | REJECTED | EXPIRED | REPLACED | UNCLEAR
timestamp:      ISO 8601, local timezone
hash:           0x... (if broadcast reached network)
amount:         USDC (human-readable)
fee:            USDC (human-readable)
recipient:      0x... (checksummed)
network:        chain name
funds_moved:    true | false | unknown
explorer_url:   link (if hash exists)
```

Receipts persist in localStorage across disconnect and refresh. The interface
re-derives companion display from stored raw state — it does not rely on runtime
memory. This prevents state hallucination after refresh.

---

## Notes on Specific States

**FAILED vs REJECTED**
These are psychologically different failure classes. REJECTED means nothing left
the wallet. FAILED means something reached the chain and was reverted. They have
opposite implications for "did my money move?" and must never be collapsed into
a single error message.

**UNCLEAR**
This is the state the Polygon Amoy faucet produced with "try again in 12 hours"
and no further explanation. It is the gap ImplicitEx must never replicate. When
status is unresolvable, name it explicitly, state that funds status is unknown,
and direct the user to an authoritative source (block explorer) before any retry.

**REPLACED**
Occurs when a user or wallet submits a second transaction with the same nonce
at higher gas (speed-up) or zero value (cancel). The outcome depends entirely
on which transaction was mined. The companion cannot determine this without
querying the replacement hash — it should direct the user to verify rather than
guess.
