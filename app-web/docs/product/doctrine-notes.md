# Doctrine Notes

**Purpose:** Observations, candidate corollaries, and worked examples that emerge
during implementation. These are not principles. They are raw material.

**Review discipline:** At major architectural milestones — or roughly monthly —
review these notes against `architectural-principles.md` and apply the derivation
test to each:

> Can this idea be derived from the existing ten principles?

If yes: the doctrine is unchanged. Consider adding the observation as an example
or corollary under the relevant principle.

If no: this is evidence a genuinely new principle may have emerged. Evaluate
whether it is a principle or a consequence of conditions that will eventually
resolve.

The doctrine is not edited during normal feature work. When you encounter an architectural question mid-implementation, write a note here and finish the implementation. Many ideas that seem fundamental during a coding session turn out to be corollaries once the implementation settles. Let the question survive a little while before promoting it.

---

## Entry taxonomy

| Type | Meaning |
|---|---|
| **Observation** | Something noticed during implementation — not yet evaluated. |
| **Corollary** | A direct consequence of an existing principle — derivable, does not need to become a new principle. |
| **Pattern** | A behavior recurring across multiple systems — may indicate an emerging principle, or may be a corollary to an existing one. |
| **Candidate Principle** | An idea that currently cannot be derived from the doctrine. Survives a review cycle before being considered for promotion. |
| **Rejected** | An idea examined and found to be derivable from existing principles, or otherwise unnecessary. Record the reasoning so it is not re-evaluated. |

Most entries will remain observations or corollaries. A candidate principle that cannot be explained by the existing ten after one review cycle is worth serious consideration. A candidate that can be explained — even partially — is a corollary.

---

## Reference implementations

`receipt-store.js` and `transfer-status.js` are the reference implementations
for what platform services should look like. Both were designed before multiple
surfaces existed. Both expose a single responsibility. Both are called by
everything; neither knows who is calling.

When designing a new platform service, use these as the target. The question is
not "what do I need now?" but "what would this look like if it had been designed
before any surface existed?"

*Candidate derivation:* Derivable from Principle 10 (single authority) — the
reference implementations are what single authority looks like in practice.

---

## Worked application: Safe support

"Should Safe support be implemented in Coin Card?"

Doctrine answer: No. Safe is an execution capability. The natural owner of
execution capabilities is the Execution Service (Principle 10, ownership model).
Coin Card consumes execution — it does not own it (Principle 8, product boundary).
Both Coin Card and Portal benefit from Safe support the moment it lands in the
Execution Service, without either surface changing.

This question is fully resolved by the existing ten principles. No new principle
required.

*Use this as a template for evaluating future execution engine questions.*

---

## The six-step methodology

Observed pattern from implementation work, 2026-07-06:

1. Find the smallest inconsistency.
2. Identify the responsibility involved.
3. Determine its natural owner.
4. Move the responsibility.
5. Remove the duplicate.
6. Repeat.

This is not a formal principle — it is what applying the ownership model looks
like in practice. Steps 1–3 are the intellectual work. Steps 4–5 are the
implementation. The methodology produces coherence because it is the same
operation applied at every scale.

*Candidate derivation:* Derivable from the unifying philosophy (two-step
identification + movement). Not a new principle.

---

## calculateFee return value — future enrichment candidate

**Type: Observation** — Do not implement until the return value grows naturally.

`IX_EXECUTION.calculateFee()` currently returns `{ fee: BigInt, total: BigInt }`. A richer value object would make the result self-describing:

```javascript
{
  rawAmount,    // input, for verification
  fee,          // BigInt
  total,        // BigInt
  basisPoints,  // number — the BPS used (chain default or override)
  chainId,      // number — which chain resolved the BPS
}
```

When this object becomes canonical, logging, receipt attachment, analytics, and debugging all consume the same structure rather than reconstructing context from call-site variables.

**When to act:** when a second consumer needs `basisPoints` or `rawAmount` from the result, or when receipt schema adds a fee-calculation audit field.

---

## Chain Authority — emerging platform service

**Type: Pattern** — Visible after Stage 2. Do not build until Stage 3 is complete.

The Execution Service CHAINS config already owns: `rpcUrl`, `explorerUrl`, `contractAddress`, `usdcAddress`, `nativeCurrency`, `feeBps`. As the system grows, it will likely also need to own: gas policy, decimals, chain display name, chain capabilities (e.g. EIP-1559, ERC-4337), supported token list.

That is the shape of a Chain Registry — not configuration embedded in the Execution Service, but a platform service that the Execution Service consumes alongside everything else.

**The pattern that makes this visible:** every time a new capability is added (fee math, gas estimation, multi-chain), the CHAINS config grows. When CHAINS config is the bottleneck for adding a new chain, the service boundary is ready to be drawn.

**When to act:** after Stage 3 (Registry Service). A Chain Registry and a Registry Service are separate services with complementary responsibilities — Chain Registry owns network topology, Registry Service owns recipient identity.

---

## Execution authority audit checklist

**Type: Pattern** — Run this after any change to execution-related code to confirm no second execution path has been introduced.

For each search: if the result appears *only* in `js/ix-execution.js` (and in comments elsewhere), the authority is clean. Any non-comment hit outside `ix-execution.js` is a violation.

```
grep -rn "eth_sendTransaction"        js/ config/ card/   # writes only — must be ix-execution.js
grep -rn "wallet_switchEthereumChain" js/ config/ card/   # must be ix-execution.js
grep -rn "eth_requestAccounts"        js/ config/ card/   # must be ix-execution.js (known violations: wallet.js, coincard-publisher)
grep -rn "\.approve("                 js/ config/ card/   # writes: must be ix-execution.js
grep -rn "transferWithFee("           js/ config/ card/   # writes: must be ix-execution.js
grep -rn "IX_EXECUTION\.\(approve\|transferWithFee\|waitForReceipt\)" js/ card/ # must return no consumer hits
```

**Execution Service baseline (2026-07-08):**

| Search | Expected | Status |
|---|---|---|
| `eth_sendTransaction` | `ix-execution.js` only | ✅ |
| `.approve(` writes | `ix-execution.js` only | ✅ |
| `transferWithFee(` writes | `ix-execution.js` only | ✅ |
| `IX_EXECUTION.approve/transferWithFee/waitForReceipt` | no consumer hits | ✅ |
| `wallet_switchEthereumChain` | `ix-execution.js` only | ✅ |
| `eth_requestAccounts` | `ix-execution.js`; publisher signing flows may request separate non-transfer authorization | ⚠️ scoped |

Consumers submit verified intent through `IX_EXECUTION.executeTransfer()` and render `ExecutionResult.status`.

**Smoke test checklist (live wallet required):**

- [ ] Connect wallet (MetaMask)
- [ ] Wrong network → switch to Polygon through `executeTransfer({ action: 'switch-network' })`
- [ ] Allowance sufficient → `executeTransfer()` goes directly to transfer
- [ ] Allowance insufficient → `executeTransfer()` handles approval, then transfer
- [ ] Receipt polling remains internal to `executeTransfer()`
- [ ] Receipt reconciliation — receipt persisted in localStorage, visible in receipt list
- [ ] Reject approval → REJECTED state
- [ ] Reject transfer → REJECTED state
- [ ] Insufficient balance → gate catches before wallet prompt
- [ ] Insufficient allowance → approval step requested

---

## Doctrine review log

| Date | Trigger | Notes reviewed | Outcome |
|---|---|---|---|
| 2026-07-06 | Initial freeze | — | Doctrine established at ten principles |
