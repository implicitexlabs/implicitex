# Transaction Trust Gate

## Standard

The launch review question is not:

> Did the transfer feature work?

The launch review question is:

> Can the user ever be forced to guess?

ImplicitEx passes this trust gate only when the interface never knows less than it claims to know. Every amount, recipient, state, receipt, and recovery instruction must be backed by the same execution evidence the platform actually has.

Related references:

- `docs/product/transaction-states.md`
- `docs/product/receipt-store.md`
- `docs/product/wallet-state-taxonomy.md`
- `docs/testing/transfer-edge-case-rehearsal.md`

## Executive Questions

1. Can a user ever become uncertain whether funds moved?
2. Can a user ever become uncertain who the recipient was?
3. Can a user ever become uncertain about the state of a transaction?
4. Can a user ever become uncertain whether the platform is waiting, failed, or completed?
5. If something goes wrong, can the user understand the next safe action?

Any "maybe" is a trust-gate finding.

## Governing Principle

The UI must never know less than it claims to know.

If the app has a confirmed chain receipt, it may say confirmed. If it has a hash but no final outcome, it must say the outcome is unknown and preserve explorer verification. If it has no reliable hash, it must not imply that funds moved, failed, or are safe to retry.

## Review Method

Walk every transaction path and ask:

> At this exact moment, what does the user believe?

Then ask:

> Is that belief true according to the strongest evidence available?

If the answer is not clearly yes, the UI, receipt, companion text, or recovery guidance needs correction.

## Integrity Gates

### Amount Integrity

Displayed amount, fee, total debit, contract call, and receipt must agree.

The app must never display a sent amount, fee, or total debit that differs from the execution path or confirmed receipt evidence.

Pass criteria:

- Entered amount and previewed amount match the execution input.
- Fee calculation is deterministic and displayed before wallet action.
- Total debit equals amount plus fee.
- Receipt amount, fee, and total debit match the stored execution facts.
- Confirmed receipt does not overwrite execution facts with weaker UI state.

### Recipient Integrity

The recipient shown before execution, during execution, after execution, and in receipt history must be the same address.

People may forgive delay. They will not forgive ambiguity around where funds went.

Pass criteria:

- Full recipient address is available anywhere a shortened address is shown.
- Recipient validation does not silently transform the destination.
- Wallet prompt, local receipt, explorer link, and UI summary refer to the same recipient.
- Account changes do not rewrite the recipient or sender facts of an existing receipt.
- Any mismatch is surfaced as an interruption, not normalized.

### State Integrity

Every transaction state must have one meaning and one user expectation.

The interface must never show success when pending, pending when failed, failed when waiting, or waiting when disconnected.

Pass criteria:

- `rejected`, `failed`, `submitted`, `pending`, `confirmed`, `outcome_unknown`, and `unclear` are visually and verbally distinct.
- `confirmed` is the only funds-moved state.
- `outcome_unknown` is not treated as failed.
- Pre-broadcast rejection never creates transfer-hash certainty.
- Hash-bearing uncertainty preserves the hash and explorer path.

### Refresh Continuity

After refresh, the app must either reconstruct the transaction state or clearly state that it cannot.

Never leave the user in a "maybe" state without naming the uncertainty.

Pass criteria:

- Active hash-bearing receipts survive refresh.
- Rehydration displays stored evidence immediately, then re-queries stronger sources.
- `ready` and `authorizing` ghosts are cleared or reclassified truthfully.
- Unknown outcome after refresh directs the user to explorer verification before retry.
- Local runtime memory is not treated as authoritative after reload.

### Wallet Continuity

Disconnects, reconnects, account changes, chain switches, mobile backgrounding, and wallet-provider events must not leave stale success, failure, sender, or network UI behind.

Pass criteria:

- Disconnect clears connected sender and stale transfer draft surfaces.
- Reconnect re-derives account and chain state instead of trusting stale UI.
- Account switch invalidates any sender-dependent draft.
- Wrong-network recovery does not leave stale "Switch network" messaging after recovery.
- Repeated provider events do not duplicate companion notices or receipt transitions.

### Failure Clarity

Failures must be distinguishable because remediation differs.

| Failure | User Message Standard | Recovery Standard |
| --- | --- | --- |
| User rejected | User chose not to proceed. No transfer was broadcast. | Retry only if intended. |
| Wallet error | Wallet could not complete the action. | Resolve wallet issue, then retry if intended. |
| RPC failure before hash | Network status could not be obtained. No reliable transaction hash is known. | Do not claim success or failure. Reconnect or retry carefully. |
| RPC failure after hash | Transaction hash exists, but local outcome could not be verified. | Verify on explorer before retrying. |
| Contract revert | Transaction reached chain and failed on-chain. Funds did not move; gas may be consumed. | Correct the cause before retrying. |
| Timeout | Status is unknown. | Preserve evidence and verify before retrying. |
| Unknown | The platform cannot determine the outcome from available evidence. | Direct independent verification; do not imply certainty. |

Pass criteria:

- User rejection and on-chain failure are never collapsed.
- Timeout alone does not become failure.
- Hash-bearing uncertainty receives stronger caution than pre-hash uncertainty.
- Every failure message includes a safe next action.

### Receipt Integrity

A receipt is a claim, not decoration.

If the receipt says "confirmed," the evidence must support confirmation. If the platform cannot prove finality, the receipt must preserve uncertainty instead of expressing confidence.

Pass criteria:

- Receipt state is derived from canonical transaction state.
- `fundsMoved: true` appears only with confirmed on-chain evidence.
- `fundsMoved: false` appears only when non-movement is known.
- `fundsMoved: null` is used when the outcome is unresolved.
- Hashes, explorer URLs, sender, recipient, amount, fee, total debit, and contract address are preserved.
- Receipt history does not corrupt active receipt recovery.

### Recovery Integrity

Trust is not merely that the system works. Trust is that the system remains understandable when it does not.

Pass criteria:

- The user can identify whether to wait, retry, reconnect, switch network, verify explorer, or stop.
- Retry is never suggested while a hash-bearing outcome remains unresolved.
- The app distinguishes recoverable uncertainty from terminal failure.
- Independent verification is available when local certainty is degraded.
- Recovery copy does not overpromise what the app can prove.

## Trust-Killer Priority

These findings block launch review until resolved:

- Wrong amount transferred or displayed.
- Recipient mismatch or ambiguity.
- Receipt inconsistency.
- Transaction state displayed incorrectly.
- Wallet connection behaving unpredictably in a way that leaves stale truth on screen.
- UI showing success when transaction failed or remains unresolved.
- Lost continuity after refresh without clear uncertainty.
- Incorrect fee calculation.

## Reliability-Gap Priority

These findings may not prove funds moved incorrectly, but they create uncertainty and should be reviewed before public exposure:

- Wallet reconnect edge cases.
- Network switching anomalies.
- Stale state after disconnect.
- Mobile wallet session persistence issues.
- Race conditions during approval and execution.
- Receipt history corruption.
- Observability blind spots.

## Deferral Boundary

UX polish, layout refinement, gas-panel enhancements, expanded analytics, and additional receipt metadata are secondary to this gate.

If a change improves appearance but leaves the user guessing about funds, recipient, state, or recovery, it does not satisfy the trust gate.
