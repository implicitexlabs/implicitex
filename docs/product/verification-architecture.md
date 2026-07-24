# Verification Architecture

**Status:** Governing document — applies to all ImplicitEx surfaces  
**Established:** 2026-07-24  
**Origin:** Receipt lifecycle incident (2026-07-23); formalized from production evidence review

---

## The core rule

**ImplicitEx does not infer successful execution from the absence of an error. Every positive assertion must identify the observation that produced it.**

This rule governs receipts, Coin Card verification, Transfer Analysis, registry checks, RPC observations, explorer links, and every other verification surface ImplicitEx adds in the future.

A confirmation is not a conclusion generated because no error appeared. It is a claim backed by affirmative, independently checkable evidence.

---

## The standard

Verification should be **layered**, **independent**, and **corroborative**.

No single verification source should be treated as sufficient when additional independent evidence is available.

When a user sees a confirmation in ImplicitEx, they should never need to ask:

- "How do you know?"
- "What exactly are you verifying?"
- "Did you actually check the blockchain?"
- "Is this an assumption?"
- "Is this cached?"
- "Is this just the UI changing?"

Every confirmation should answer those questions before they are asked.

---

## Evidence hierarchy

Each level represents a distinct, independent observation. Higher levels do not imply lower levels have been checked unless that check is explicitly performed and recorded.

| Level | Evidence | Source |
|-------|----------|--------|
| 1. User intent | Amount, recipient, memo, purpose | User input |
| 2. Wallet authorization | Signed transaction | MetaMask / wallet |
| 3. Network acceptance | Transaction hash assigned | RPC broadcast |
| 4. Settlement | Transaction included in a block | Blockchain |
| 5. Finality | Required confirmation count reached | Blockchain |
| 6. Registry | Coin Card identifier verified | Registry |
| 7. Local receipt | Archived proof packet with all settlement fields | ImplicitEx |

These are **independent observations**, not copies of the same observation. If two levels disagree, that disagreement is itself evidence — not a state to be silently resolved.

---

## Eight principles

### 1. Every claim has a source

No verification output should appear without identifying what observation produced it. "Confirmed" must trace to a specific RPC response, transaction receipt, or blockchain record — not to the absence of a failure.

### 2. Every source has a confidence level

Sources differ in reliability, latency, and independence. An RPC node response is not equivalent to a finalized blockchain record. An explorer link is not equivalent to an independent RPC query. The system should model and expose this difference, not flatten it.

### 3. Independent sources strengthen confidence

When the portal receipt, the exported proof packet, the RPC observation, the explorer link, the transaction calldata, and the ERC-20 transfer logs all agree — that agreement is the confirmation. No single source achieves that alone.

### 4. Conflicting sources reduce confidence

When sources disagree — a receipt reports confirmed but the RPC finds no block, or an explorer shows a different recipient — that conflict must surface as an observable state, not be suppressed. Disagreement between sources is more informative than either source alone.

### 5. Unknown is preferable to assumed

A state of `outcome-unknown` is an honest system state. It is preferable to a premature `confirmed` or a silent assumption of success. The UI must represent uncertainty as a first-class condition.

### 6. Absence of evidence is not evidence of success

No transaction should be marked confirmed because no error was returned. No Coin Card should be marked verified because no rejection was received. No recipient should be trusted because no mismatch was detected. Every positive assertion requires a positive observation.

### 7. The UI explains why

When verification passes, the UI should be able to show what evidence produced that result. When verification fails or is incomplete, the UI should explain what was checked and what was missing — not show a generic error.

### 8. Every verification is reproducible from the proof packet

The exported proof packet is the system of record. A reviewer with the proof packet and access to the public blockchain should be able to independently reproduce every verification claim the UI made. If a claim in the UI cannot be reconstructed from the proof packet, the proof packet is incomplete.

---

## Signal semantics

The existing signal vocabulary applies here:

| State | Semantics | Signal |
|-------|-----------|--------|
| Confirmed | Affirmative chain evidence matches frozen transfer intent | Neutral / white |
| Submitted | Transaction broadcast; settlement not yet established | Amber |
| Failed / reverted | Negative chain evidence; funds not moved | Red |
| Outcome unknown | Insufficient evidence; funds movement cannot be asserted | Amber |
| Conflict detected | Multiple sources with incompatible observations | Red |

"Unknown" is never a reason to show green. "No error yet" is not "confirmed."

---

## Confidence as a UI property

Binary success/failure is insufficient for a system with multiple independent verification sources. Confidence should be treated as a property of the current observation set, not a binary outcome.

When all sources agree and all levels are confirmed, confidence is complete. When a source is temporarily unavailable, degraded, or conflicting, confidence is partial. The UI should represent partial confidence — not pretend it is complete.

Example structure (not a prescribed UI):

```
Settlement (blockchain)      ████████████ confirmed, block 90780021
RPC observation              ████████████ confirmed, success status
Explorer linkage             ████████████ present, same hash
Receipt integrity            ████████████ archived, all fields populated
Proof packet completeness    ████████████ all settlement fields, metadata preserved
Coin Card                    ░░░░░░░░░░░░ not present in this transfer
```

When sources are temporarily unavailable, that is shown — not suppressed.

---

## Application to existing surfaces

### Transfer Portal

- Receipt state must be produced by affirmative RPC confirmation, not inferred from the absence of a revert
- `fundsMoved: true` requires an RPC receipt with success status and a non-null block number
- `approvalHash` and `transactionHash` must be distinct observations when both steps occurred
- `outcome-unknown` is a valid archived state when chain confirmation could not be established locally
- Metadata (purposeTag, referenceId, memo) must survive every state transition in the receipt pipeline

### Proof Packet

- The canonical proof artifact is the browser-generated export, preserved byte-for-byte
- Reconstructed or summarized artifacts are not substitutes — they risk omitting schema fields, evidence sections, or timestamps that an independent reviewer needs
- Every field in the export should be independently verifiable against the public blockchain

### Coin Card

- "Verified by" must identify what was verified and when, not just assert verification occurred
- Registry lookups must identify the source of the registry response
- If the registry is unavailable, the UI shows that — not a cached or assumed state

### Transfer Analysis (future)

- Every risk signal must identify its source observation
- Absence of a known-bad pattern is not clearance — it is the absence of that specific signal
- Confidence in recipient address analysis should reflect the coverage and recency of the data source

---

## What this incident established

The receipt lifecycle incident (2026-07-23) is the founding production example of this architecture in practice.

The defect: a successful on-chain transfer was archived as `READY` because the state machine rejected the `READY → SUBMITTING` transition, the caller ignored the rejection, and `clearActive()` archived the pre-transfer receipt. The exported proof packet showed `status: "ready"`, `transactionHash: null`, `fundsMoved: null` — despite a confirmed on-chain execution.

The correct behavior, now enforced:
- State transitions return authoritative results; callers must check them
- `clearActive()` only archives a receipt that is in a terminal state
- The proof packet represents the actual state of the receipt at archival — not an assumed state

The investigation produced two production proof packets:

- **Approval path** (2026-07-23): block 90,776,572; approvalHash and transactionHash both present; `READY → AUTHORIZING → AUTHORIZED → SUBMITTING → SUBMITTED → CONFIRMED`
- **Transfer-only path** (2026-07-24): block 90,780,021; `approvalHash: null`; metadata fields preserved; `READY → SUBMITTING → SUBMITTED → CONFIRMED`

Both packets are independently verifiable on Polygonscan. Both agree with the portal receipt, the RPC observation, and the on-chain state. That agreement is the confirmation.

---

## Relationship to other documents

| Document | Relationship |
|----------|-------------|
| `implicitex-constitution.md` | Founding principles — authority in the verifiable |
| `architectural-principles.md` | Ten implementation rules (frozen at 467c8c8) |
| `evidence-protocol-overview.md` | Evidence layer design; Coin Card as renderer |
| `docs/product/transaction-states.md` | Eight-state vocabulary for the transfer state machine |
| Blockaid review packet §7.7 | Production evidence implementing these principles |

This document does not modify `architectural-principles.md`. Observations that derive from or extend the ten principles belong in `doctrine-notes.md` until an architectural milestone warrants a revision.
