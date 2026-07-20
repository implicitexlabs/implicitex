# Evidence Protocol Overview

ImplicitEx is building an evidence protocol. Coin Card is its first renderer.

---

## What the protocol does

It preserves the evidence behind a digital commitment — who made it, to whom,
under what conditions, and what was verified at the time — in a form that can
be independently inspected and deterministically reconstructed.

---

## The data flow

```
Real-world act
(wallet signature, domain verification, business registration)
        ↓
Evidence Event
(append-only, immutable record of what occurred)
        ↓
Projection Engine
(applies authority rules, derives current state from event history)
        ↓
Evidence Item
(current claim state for a specific subject and target)
        ↓
Evidence Block
(related items grouped by domain for consumer navigation)
        ↓
Consumers

  Coin Card          — identity surface before a transfer
  Commitment Review  — structured reflection before irreversible commitment
  Transfer Intelligence — evidence-based confidence signal
  Enterprise API     — organizational policy enforcement
  PDF export         — audit artifact
  CLI                — developer and operator tooling
```

---

## What each layer is responsible for

**Evidence Event** — records a historical fact. Never mutated. The signature
was evaluated against the challenge and recovered this address at this time.
That remains true regardless of what happens afterward.

**Projection Engine** — produces current state from events. Applies authority
rules to determine which events are valid, orders them by canonical sequence,
and derives Item state. Authority validation is a first-class gate, not an
afterthought.

**Evidence Item** — the current interpretation of all applicable events for
one specific claim. State changes as events accumulate (`current` →
`superseded` → `revoked`). It is not authoritative independently — it is
projection output.

**Evidence Block** — groups related Items by domain (wallet control, domain
ownership, business registration). Adds no new facts. Exists for consumer
navigation.

**Consumer** — renders some or all of the evidence graph for a specific
purpose. May omit detail. May never invent it.

---

## Four properties that make this a protocol, not a UI

**Stable primitives.** Events are immutable. Storage can change; the historical
record does not.

**Deterministic projection.** Same events + same projection version = same
output. The projection engine is testable as a pure function over event history.

**Explicit authority.** Every event type specifies who may issue it, what
authenticates that authority, and what preconditions must hold. Authority
validation belongs in the projection engine, not in individual renderers.

**Renderer independence.** The protocol knows nothing about Coin Card, PDFs,
or APIs. Consumers share a common evidence graph. A new consumer requires no
changes to the protocol layer.

---

## The governing invariant

> A renderer may omit evidence. It may never invent it.

---

## Where to go next

| Question | Document |
| -------- | -------- |
| What are the founding principles? | `docs/product/implicitex-constitution.md` |
| What does wallet-control evidence look like? | `docs/product/identity-evidence-schema.md` |
| Who may issue which events? | `docs/product/wallet-control-authority-matrix.md` |
| What is Coin Card's constitutional purpose? | Memory: Coin Card identity reframing (2026-07-19) |
| What is Commitment Review? | Memory: ImplicitEx security vision |
