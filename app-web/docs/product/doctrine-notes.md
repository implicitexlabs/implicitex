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

## Doctrine review log

| Date | Trigger | Notes reviewed | Outcome |
|---|---|---|---|
| 2026-07-06 | Initial freeze | — | Doctrine established at ten principles |

