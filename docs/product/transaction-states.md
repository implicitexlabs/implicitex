# ImplicitEx — Transaction State Vocabulary

The canonical state machine for all transaction events. Every companion message,
receipt label, next-action suggestion, and storage key derives from
`app-web/frontend/public/js/transfer-status.js`.

Stored state values are lowercase. Display labels may use title case.

---

## Governing Rules

**1. "Funds Moved?" is always answered first.**
If the companion communicates nothing else, it answers that question.

**2. Uncertainty is not failure.**
The companion must not imply a transaction failed when the outcome is genuinely
unknown. Uncertainty and failure are different. Treating them as the same causes
users to retry transactions that may have already confirmed.

Hash-bearing uncertainty is `outcome_unknown`, not generic `unclear`. Once a
transfer hash exists, the app has durable evidence and must preserve explorer
verification before any retry guidance.

**3. AI never invents state.**
If an AI interpretation layer is added later, it annotates known state —
it does not classify it. The state machine is authoritative. The AI is explanatory.

**4. `submitted` and `pending` are distinct only when the provider gives evidence.**
If the RPC cannot distinguish mempool presence from initial broadcast, collapse
both into `submitted`. Do not fabricate state granularity that the provider cannot
confirm.

**5. `confirmed` is the only funds-moved state.**
`fundsMoved: true` is written only after on-chain confirmation. Approval, wallet
confirmation, broadcast, and local visibility loss do not mean funds moved.

---

## State Table

| State | Meaning | Funds Moved? | User Action | Companion Message |
|---|---|---|---|---|
| `draft` | User has entered possible transfer details, but the app has not validated or requested wallet action. | No | Review details. | "Transfer draft. No wallet action requested." |
| `ready` | Transfer details validated and exact debit calculated. | No | Continue or edit. | "Transfer ready. No wallet action requested yet." |
| `authorizing` | USDC allowance authorization requested or submitted. | No | Confirm authorization or wait for approval confirmation. | "USDC authorization in progress. Funds are not sent yet." |
| `authorized` | Approval confirmed or existing allowance is sufficient. Transfer has not been submitted. | No | Confirm transfer if intended. | "USDC authorization ready. Transfer not submitted yet." |
| `submitting` | Transfer confirmation requested in wallet, but no transfer hash is known yet. | Unknown | Do not refresh if wallet is open. | "Transfer confirmation requested. Awaiting wallet or transaction hash." |
| `submitted` | Transfer hash exists. Broadcast evidence is available, but confirmation is unresolved. | Unknown — verify before retrying | Wait. Do not retry. Preserve the hash and explorer link. | "Transaction submitted. Awaiting network confirmation. Do not retry yet." |
| `pending` | Seen by network nodes. In mempool, awaiting mining. Only use when provider confirms mempool presence. | No | Wait. Do not retry. | "Transaction pending. The network is working. No funds have moved yet." |
| `confirmed` | Included in a finalized block. On-chain record exists. | Yes | Review receipt. | "Transfer confirmed. Funds have moved. Receipt available on Polygonscan." |
| `rejected` | Cancelled in wallet before broadcast. Nothing reached the network. | No | Retry if intended, or do nothing. | "Transaction rejected in wallet. Nothing was sent. No funds moved." |
| `failed` | Reached the network. Included in a block. Execution reverted on-chain. | No — gas was consumed | Check reason. Correct inputs. Retry only if appropriate. | "Transaction failed on-chain. Transfer did not complete. Gas was consumed. Funds were not moved." |
| `outcome_unknown` | Transfer hash exists, but local confirmation visibility failed after broadcast. Cause: RPC error, reload, wallet disconnect, or provider wait failure. | Unknown — verify before retrying | Verify on explorer using the stored hash. Do not retry until the outcome is verified. | "Outcome unknown. Verify on explorer before retrying." |
| `unclear` | Insufficient evidence to classify the attempt, usually because no reliable transfer hash exists. | Unknown — do not assume | Review local state. If a hash appears later, promote to `submitted` or `outcome_unknown`. | "Transaction status is unclear. No reliable network record is available." |
| `expired` | Broadcast but dropped from mempool before mining. Cause: gas too low or network timeout. | No | Retry with adjusted gas, or wait for network conditions to improve. | "Transaction expired. Not processed by the network. No funds moved. Retry with higher gas if needed." |
| `replaced` | A later transaction with the same nonce was mined instead. Cause: speed-up or cancel action. | Depends on the replacement | Verify which transaction was mined on Polygonscan before proceeding. | "Transaction replaced by a later submission. Verify the outcome on Polygonscan before proceeding." |

---

## State Transition Map

```
[user submits valid transfer details]
        │
        ▼
    ready
        │
        ├──► authorizing → authorized
        │
        ▼
    submitting
        │
        ▼
    submitted
        │
        ├──► pending (if provider confirms mempool)
        │        │
        │        ▼
        ├──► confirmed  ← terminal, positive
        ├──► failed     ← terminal, negative (reverted on-chain)
        ├──► outcome_unknown ← non-terminal, hash-bearing (verify explorer; re-query)
        ├──► expired    ← terminal, negative (dropped from mempool)
        ├──► replaced   ← terminal, ambiguous (check replacement)
        └──► unclear    ← non-terminal, insufficient evidence (usually no reliable hash)

[user cancels in wallet]
        │
        ▼
    rejected               ← terminal, pre-broadcast
```

---

## Companion Tone Rules

- No first-person language. Subject is always the transaction or the network.
- No emotional coloring. No apology, no celebration, no reassurance beyond fact.
- Present tense for current state. Past tense only in confirmed receipts.
- Do not speculate. If the state is `outcome_unknown` or `unclear`, name that state directly.
- Operational truth only. The companion reads like an instrument, not a voice.

**Correct:**
> "Transaction submitted. Awaiting network confirmation. Do not retry yet."

**Incorrect:**
> "We're processing your transaction! Hang tight 🚀"

---

## Receipt Structure

Every transaction attempt — including failures — produces a receipt. Receipts are
archived when a terminal state is reached. The companion displays one current
reading at a time. Archive access is secondary and intentionally quieter.

Minimum receipt fields:

```
id
createdAt
chainId
sender
recipient
amount
fee
totalDebit
contractAddress
approvalHash
transferHash
state
fundsMoved
explorerUrl
lastKnownMessage
```

Receipts persist in localStorage across disconnect and refresh. The interface
re-derives companion display from stored raw state — it does not rely on runtime
memory. This prevents state hallucination after refresh.

---

## Notes on Specific States

**failed vs rejected**
These are psychologically different failure classes. `rejected` means nothing left
the wallet. `failed` means something reached the chain and was reverted. They have
opposite implications for "did my money move?" and must never be collapsed into
a single error message.

**unclear**
`unclear` means the app lacks enough evidence to classify the attempt, usually
because no reliable transfer hash exists. It is not a synonym for failed, and it
is not the normal state for hash-bearing uncertainty.

**outcome_unknown**
`outcome_unknown` means a transfer hash exists but local confirmation visibility
failed. The hash is durable evidence. Preserve it, preserve the explorer link,
state that funds status is unknown, and direct the user to verify the explorer
before any retry.

**replaced**
Occurs when a user or wallet submits a second transaction with the same nonce
at higher gas (speed-up) or zero value (cancel). The outcome depends entirely
on which transaction was mined. The companion cannot determine this without
querying the replacement hash — it should direct the user to verify rather than
guess.
