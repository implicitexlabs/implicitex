# ImplicitEx - Transfer Edge-Case Rehearsal

This document is the rehearsal matrix for transfer interruptions and recovery
paths. It exists to keep the transfer instrument calm, truthful, and
recoverable under stress.

Runtime code is authoritative for machine behavior. This document records the
expected choreography so reviewers and testers can verify that the user stays
oriented when the flow is interrupted.

## Matrix

| Scenario | Expected state | Expected fundsMoved | Expected provenance | Expected companion language | Expected receipt behavior | Expected explorer behavior | Retry guidance | Pass/fail notes |
|---|---|---|---|---|---|---|---|---|
| Authorization rejected in wallet | `rejected` | `false` | `wallet` | `Authorization rejected in wallet.` `No transfer was broadcast.` | Receipt resolves terminally and archives. No hash should be created. | No explorer link. | Retry when ready, or do nothing. | Pass if no broadcast artifact exists and the active receipt is cleared. |
| Transfer rejected after approval | `rejected` | `false` | `wallet` | `Transfer rejected in wallet.` `No transfer was broadcast.` | Approval hash may exist. Transfer hash must not exist. | Explorer link should not be shown unless a transfer hash exists. | Retry when ready, or do nothing. | Pass if approval and transfer are distinguished clearly. |
| Wallet busy `-32002` | `interrupted` | `null` | `wallet` | `Wallet request already pending in MetaMask.` `Complete or dismiss the existing wallet request before retrying.` | Receipt stays non-terminal and preserves any prior facts. | No explorer link unless a transfer hash already exists from a prior step. | Complete or dismiss the existing wallet request, then retry. | Pass if the app neither implies failure nor success. |
| Reload after submitted hash is stored | `submitted`, `pending`, or `outcome_unknown` until reconciliation | `null` | `rehydration` | `Transaction submitted. Awaiting network confirmation.` or `Transaction outcome could not be verified locally.` | Hash, explorer URL, and local metadata survive reload. Rehydration may enrich the receipt, but it must not weaken it. | Explorer link remains visible or recoverable. | Verify the explorer before retrying. | Pass if the app remembers the hash and stays honest about uncertainty. |
| RPC timeout after broadcast | `outcome_unknown` | `null` | `rpc` or `rehydration` | `Transaction outcome could not be verified locally.` | Hash-bearing uncertainty is preserved. | Explorer verification is emphasized. | Verify on explorer before retrying. | Pass if the app does not claim failure without a chain revert. |
| Wrong network mid-flow | `interrupted` or blocked flow | `false` or `null` | `wallet` | `Wrong network.` `Switch to Polygon before sending.` | No terminal transfer receipt should be created. | No explorer link. | Switch to Polygon and re-enter details if the draft was invalidated. | Pass if the flow protects the user without sounding punitive. |
| Account switch mid-flow | `interrupted` | `false` or `null` | `wallet` | `Wallet account changed. Review the connected sender and re-enter transfer details.` | Preserve the receipt if it already exists. Do not silently rewrite sender facts. | Explorer behavior depends on whether a hash already exists. | Re-enter details with the intended account. | Pass if the mismatch is surfaced calmly and the user is not misled. |
| Mobile keyboard + companion open | unchanged | unchanged | unchanged | Companion remains subordinate and readable. | No receipt mutation. | Explorer links and proof buttons must remain usable. | None. This is a layout rehearsal. | Pass if the transfer controls remain reachable and the companion does not overlap critical actions. |
| Proof packet export on a small screen | unchanged | unchanged | unchanged | `Export proof packet` remains available and distinct from explorer verification. | Export uses the stored receipt data and schema version. | Explorer link must not be confused with export. | None. | Pass if export is present, legible, and archival in tone. |

## Known Ambiguities

- Wallet providers do not always expose deterministic mempool visibility.
- A broadcast hash is the boundary between pre-broadcast interruption and
  hash-bearing uncertainty.
- `outcome_unknown` is not a failure state. It means the transfer was
  broadcast, but local verification could not prove the final outcome.
- `unclear` is used only when the app lacks enough evidence to classify the
  attempt.
- Rehydration may enrich facts from the chain, but it must not weaken stronger
  facts already stored locally.

## Rehearsal Notes

- Prefer observational notes before code changes.
- Batch copy or layout fixes when multiple rehearsals point in the same
  direction.
- Record the exact state, hash presence, and explorer behavior for each
  interruption.
- When the outcome is hash-bearing uncertainty, verify the explorer before
  retrying.

## Suggested Review Order

1. Authorization rejection.
2. Transfer rejection after approval.
3. Wallet busy `-32002`.
4. Reload after submitted hash is stored.
5. RPC timeout after broadcast.
6. Wrong network mid-flow.
7. Account switch mid-flow.
8. Mobile keyboard and companion overlap.
9. Proof packet export on a small screen.
