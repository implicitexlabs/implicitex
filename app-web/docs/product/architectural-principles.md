# ImplicitEx Architectural Principles

**Established:** 2026-06-23

These are not implementation details. They are constitutional rules that govern future product decisions. When a feature proposal arrives, the question is: does it strengthen these principles or weaken them?

**Adding new principles:** Before adding a Principle 11 or beyond, ask: can this idea be derived from the existing ten principles? If yes, it belongs as a corollary or example under an existing principle, not as a new one. A new principle is warranted only when the idea cannot be derived from what already exists. This discipline keeps the doctrine from becoming an encyclopedia.

---

## 1. Transfers execute only on ImplicitEx-controlled surfaces.

Wallet connection, approval, execution, and receipt all occur on the ImplicitEx domain. No third-party embed, widget, or iframe initiates or completes a transfer. This preserves user trust, maintains the entity graph, and ensures that every transfer is a brand touchpoint.

**Corollary:** The redirect model for the widget is not a technical compromise. It is the mechanism that enforces this principle under distribution pressure.

---

## 2. Analytics are opt-in and cannot affect transfer execution.

Analytics are disabled by default. No data leaves the browser without explicit user consent. The analytics layer is vendor-independent — the backend is a pluggable function slot, not a hardcoded SDK. Analytics errors are swallowed silently. Analytics must never interrupt, delay, or affect the transfer flow in any state.

**Corollary:** `IX._analyticsEnabled` defaults to `false`. It is set to `true` only after confirmed consent. The consent mechanism comes from outside `analytics.js`.

---

## 3. Recipient-bound widgets are distribution surfaces, not payment engines.

A widget's job is to present recipient context and hand the sender off to ImplicitEx. It does not execute wallet logic, request permissions, collect addresses, or complete transfers. The widget's execution surface is: read `data-*` attributes, render a trust card, open a redirect URL. Nothing beyond that.

**Corollary:** The widget spec's MVP exclusions (iframe flow, postMessage bridge, wallet connection inside widget) are permanent architectural decisions, not deferred features.

---

## 4. Public-facing claims should be verifiable on-chain whenever possible.

Fees, addresses, contract behavior, and transaction outcomes are stated in terms that can be independently verified — on Polygonscan, against the contract source, or through the receipt system. Marketing language that cannot be verified is avoided. Commit hashes in the engineering log make development claims independently checkable.

**Corollary:** "VERIFY EVERYTHING." is not a tagline. It is a constraint on what can be said.

---

## 5. Identity and trust signals compound across the ecosystem.

Every asset — pages, widgets, documentation, social presence, press mentions — should contribute to the same entity graph rather than starting from zero. Canonical URLs, structured data, `sameAs` references, and consistent naming are infrastructure, not decoration. Each new asset inherits the entity that already exists.

**Corollary:** Adding pages without strengthening the entity graph is less valuable than it appears. The compounding effect only works if new assets are properly anchored.

---

## 6. Coin Card separates payment route evidence from transfer execution.

Coin Card publishes payment intent and route evidence. ImplicitEx executes the
transfer. These are separate acts performed on separate surfaces.

The free self-hosted Coin Card tier verifies the route, not the recipient
identity. It may validate the official contract, supported network, supported
token, address format, fee math, and transaction proof. It must not claim that
ImplicitEx verified the host, recipient identity, or wallet ownership.

Registered and paid tiers may add recipient, domain, wallet-control, registry,
signature, and revocation evidence. Those claims require explicit evidence and
must not be borrowed by the free tier.

The trust hierarchy is fixed:

```
URL parameters    — transport (claims only)
Manifest/registry — evidence (route or identity claim, depending on tier)
Wallet prompt     — execution (user confirms and signs)
Chain event       — settlement proof (on-chain, independently verifiable)
```

No step in this hierarchy can substitute for any other. A manifest or registry
record does not execute a transfer. A completed transfer does not retroactively
verify a recipient identity. They are distinct claims about distinct acts.

**Corollary:** Coin Card verification must never be presented as proof of
payment. Free-tier verification confirms the route and host-supplied payment
instructions. Registered-tier verification may confirm a published recipient
record. Settlement proof is the on-chain transaction hash.

**V1 limitation (2026-06-25):** Registry manifests are public static JSON records served from `/registry/coincards/`. They are not cryptographically signed. Trust is based on HTTPS delivery from the ImplicitEx domain, not on a signature that could be independently verified offline. Cryptographic signing is a future upgrade, not the current state.

---

## 7. Evidence Over Trust

ImplicitEx should minimize the amount of trust users must place in ImplicitEx itself. Whenever possible, the system should provide user-held, portable, and independently verifiable evidence of identity, intent, and execution. Verification artifacts must be available at the moment trust is required, not introduced after the fact.

Most payment systems ask users to trust one of: the company, the bank, or the platform. ImplicitEx operates on a fourth model: trust the evidence.

**The test:** Does this feature increase the user's ability to verify the transfer without trusting ImplicitEx? If yes, it strengthens the evidence layer. If no, it is UX polish — useful, but not architecturally load-bearing.

**The hard discipline:** Evidence has to be present at the moment the user needs it — not retroactively added after trust is broken. The order is fixed:

1. Make the claim.
2. Provide the evidence.
3. Only then ask the user to act.

**Evidence Supremacy Principle:** when evidence sources disagree, the most
objective and transaction-proximate evidence controls.

Conflict order:

```text
Blockchain evidence
        ↓
Recorded Coin Card evidence at transaction time
        ↓
Current host manifest or registry record
        ↓
Human testimony
```

Examples:

- If the current host manifest conflicts with the recorded manifest hash, the
  recorded transaction-time Coin Card evidence controls the historical claim.
- If recorded Coin Card evidence conflicts with the confirmed on-chain transfer,
  the blockchain record controls settlement truth.
- If a person claims a different intended recipient than the host manifest
  supplied at transaction time, the recorded Coin Card evidence controls what
  ImplicitEx presented and executed.

**Evidence layer inventory (as of 2026-06-29):**

| Artifact                  | Purpose                           |
|---------------------------|-----------------------------------|
| Coin Card                 | Route evidence; identity evidence only when verified/registered |
| Receipt ID                | Stable reference evidence         |
| Confirmed Transfer block  | Execution evidence                |
| Proof Packet              | Portable evidence                 |
| Explorer link             | Independent verification          |
| Block number              | Chain anchoring                   |
| Receipt persistence       | User custody of evidence          |
| Copy Receipt              | Human-readable evidence           |

**Corollary:** The strongest version of ImplicitEx may be the one that requires the least trust in ImplicitEx itself. Unlike reputation systems or third-party approvals, the evidence layer is an asset ImplicitEx owns regardless of what third parties decide.

---

## 8. An instrument owns its identity. A workflow owns its state.

This principle operates at two levels. The levels are not equal. The product boundary is resolved first. The implementation boundary is resolved within it.

### Product boundary (resolve first)

**Where does this feature live?**

```
Coin Card (payment instrument)
    owns:
    • identity
    • transaction
    • receipt

Transfer Portal (inspection console)
    owns:
    • inspection
    • verification
    • diagnostics
    • advanced controls
```

**Coin Card is a complete payment instrument. The Transfer Portal is an optional inspection and verification console. Every payment must be completable without leaving the Coin Card.**

**The hard invariant:** The Transfer Portal never becomes a required step in completing a payment. This is stronger than "the Portal does not execute." A Portal that does not execute but must be visited before execution still violates the product boundary. The Portal is always optional, always secondary, always reachable from the instrument — never the other way around.

Both products consume the same execution engine (`window.IX_EXECUTION`) independently. Neither calls the other.

**The decision filter:**

- Does this feature help a user understand, verify, or diagnose a transfer? → Console feature.
- Does it execute, approve, submit, or confirm a transfer? → Instrument feature.
- Does it require the Portal to be visited before or during a transfer? → This violates the product boundary regardless of where the code lives.

### Implementation boundary (resolve second, within Coin Card)

**Within the Coin Card, is this identity or workflow?**

A payment instrument owns a permanent identity region. That region never changes based on execution progress. A workflow — wallet connection, approval, transfer, confirmation — is stateful. The two must never be confused in design or implementation.

**The distinction:**

| Instrument (identity) | Workflow (state) |
|---|---|
| Verification status | Wallet connection |
| Issuer | USDC approval |
| Card holder name | Transfer execution |
| Recipient address | Confirmation wait |
| Network / token | Receipt generation |
| Brand mark | Error recovery |
| Attribution | |

**The Coin Card architecture (reference implementation):**

```
Coin Card
├── Identity Shell (instrument — never destroyed, never state-controlled)
│   ├── Header: verification status + credential
│   ├── Trust: ISSUED BY / CARD HOLDER / RECIPIENT / NETWORK
│   └── Footer: ¢OIN CARD mark + attribution
│
└── Transaction Surface (workflow — state-controlled)
    ├── Gift view
    ├── Amount entry
    ├── Connect / Switch network
    ├── Confirm panel
    ├── Execution status
    └── Receipt
        │
        └── Execution Engine (infrastructure — not a visual layer)
            ├── MetaMask / WalletConnect / Safe
            ├── USDC approve
            ├── transferWithFee
            └── Receipt polling
```

The execution engine is infrastructure that serves the transaction surface. The transaction surface reflects its progress. The identity shell is unaffected by either.

**Corollary:** State rules in CSS, JavaScript, and server logic should never target identity shell elements. If a rule asks "hide the recipient address during EXECUTE_PENDING," it has violated the instrument boundary before a line of code is written.

**The test:** When a feature is proposed, ask — in order:

1. Does it belong to the instrument or the console? → Product boundary.
2. Within the instrument: is it identity or workflow? → Implementation boundary.

---

## 9. Every product has exactly one primary surface.

For Coin Card, the primary surface is the Coin Card. Secondary surfaces exist — Transfer Portal, Explorer, Receipt, Registry, Logs — but none of them are required for the normal payment path.

A secondary surface that becomes required for the normal path has displaced the primary surface. That is a product boundary violation even if no code moved.

**The Coin Card surface hierarchy:**

```
Primary surface (required for payment):
    Coin Card

Secondary surfaces (optional, reachable from the primary):
    Transfer Portal  — advanced inspection and verification
    Explorer         — independent on-chain confirmation
    Receipt          — portable proof artifact
    Registry         — recipient identity record
    Logs             — engineering and operations
```

**The test:** Can a sender complete the normal happy path — connect wallet, set amount, approve, transfer, receive confirmation — without leaving the primary surface? If the answer is no, a secondary surface has become required. That is the failure mode this principle exists to prevent.

**Why this matters:** Feature creep almost never announces itself as a product boundary violation. It arrives as a convenience: "We could show more detail if we linked to the Portal here." The link is optional. Then it becomes "We should require Portal confirmation for large transfers." Now the Portal is required. The principle draws the line before that drift begins.

---

## 10. Every capability has exactly one implementation.

Not shared code. Single authority.

If someone fixes gas estimation, there is exactly one place where that fix is made. If fee math changes, there is one function that changes. If the registry schema changes, there is one loader that handles it. Duplication is not a style concern — it is a correctness concern. When the same capability has two implementations, one of them accumulates improvements the other never receives.

**The test:** When a capability improvement is made, how many *independent implementations* must change? Legitimate layering across files is acceptable — a capability that naturally spans a loader, a validator, and a cache is not duplicated. But if the algorithm itself exists twice, a second authority has been created. That is the thing to eliminate.

**No surface may become the authority for a platform capability.** Coin Card is not the authority for fee math, wallet connection, execution, or registry parsing. The Transfer Portal is not either. Those belong to platform services. The surfaces are consumers. This is the architectural constraint that prevents business logic from drifting back into UI code.

**Platform Services layer:**

```
Platform Services
    │
    ├── Execution Service   — connectWallet, switchChain, calculateFee,
    │                         approve, executeTransfer, waitForReceipt
    ├── Registry Service    — loadCard(cardId) → validated manifest
    ├── Receipt Service     — create, update, archive, rehydrate
    └── State Service       — IX_TRANSFER_STATES, ALLOWED_TRANSITIONS
```

Every UI surface is a consumer of this layer, not an owner of any part of it:

```
Coin Card ─────────────────────┐
Transfer Portal ────────────── Platform Services
Verify Page ───────────────────┤
Publisher ─────────────────────┘
```

The platform is not Coin Card. The platform is not the Portal. They are clients.

**The canonical authority table:**

| Capability | Platform service | Current status |
|---|---|---|
| Execution (approve, transfer) | Execution Service | Coin Card: correct. Portal: bypasses service (HIGH). |
| Fee calculation | Execution Service | Two implementations, different math (MEDIUM). |
| Wallet connection | Execution Service | Three implementations (MEDIUM). |
| Chain switching | Execution Service | Two implementations (LOW). |
| Registry manifest loading | Registry Service | Four independent fetchers (HIGH). |
| Recipient verification | Registry Service | `coincard.js` only — acceptable interim. |
| Receipt generation | Receipt Service | `receipt-store.js` — already clean. |
| Transfer state machine | State Service | `transfer-status.js` — already clean. |

**On the Execution Service:**

The authority for execution belongs to a platform-level service — not to the Coin Card, not to the Transfer Portal, and not to any implementation file that a surface happens to own. The current `ix-execution.js` is the seed of this service. It is not yet the service itself.

Files are implementation details. Services are architectural concepts. Five years from now the implementation may be `execution-service.ts`, multiple modules, a WebAssembly bridge, or a hardware wallet adapter. The architecture does not change because the implementation does. When WalletConnect, Safe, and Ledger arrive, they are Execution Service features — Coin Card and Portal both benefit from them simultaneously, without either surface changing.

The reference pattern: `receipt-store.js` and `transfer-status.js`. Both were designed before multiple surfaces existed. Both expose a single responsibility. Both are called by everything; neither knows who is calling. That is what the Execution Service should become.

**Known authority violations as of 2026-07-06 (consolidation roadmap):**

Three stages, ordered by risk and dependency. Stage 2 depends on Stage 1. Stage 3 is independent.

*Stage 1 — Execution authority (highest risk):*

`wallet.js` constructs its own ethers.js Contract instances and calls `approve()` and `transferWithFee()` directly — bypassing the Execution Service entirely. This creates a second execution path with independent error handling, gas estimation, retry logic, and no path to future engine support. Fix: define the Execution Service contract and route `wallet.js` through it. This also collapses the wallet connection and chain switching violations.

*Stage 2 — Fee authority (medium risk, depends on Stage 1):*

`card.js` calculates fees in floating-point with hardcoded BPS defaults. `wallet.js` calculates fees in BigInt from chainConfig. A user may see one fee displayed and a different fee submitted. Fix: move fee calculation into the Execution Service. Both surfaces call `calculateFee(amount, chainId)`. One result, one rounding strategy.

*Stage 3 — Registry authority (high structural risk, independent of Stages 1–2):*

`card.js`, `coincard.js`, `coincard-handoff.js`, and `verify.js` each fetch the registry manifest independently, with diverging validation logic. Schema changes require four updates. Fix: Registry Service exposes `loadCard(cardId)` → validated manifest. Schema validation, caching, version negotiation, and future signature verification happen once.

**Corollary:** Before adding a new capability, locate its single authority. If none exists, create the authority first. No surface may implement what belongs to a platform service.

---

## How to use these principles

These principles answer future questions before they arise. When a feature is proposed:

1. Does it require wallet execution on a surface ImplicitEx does not control? → Principle 1 blocks it.
2. Does it introduce analytics that activate without consent or could interrupt a transfer? → Principle 2 blocks it.
3. Does it move the widget toward a payment engine rather than a distribution surface? → Principle 3 blocks it.
4. Does it make claims that cannot be verified on-chain or through public records? → Principle 4 blocks it.
5. Does it create a new brand surface that is disconnected from the entity graph? → Principle 5 flags it for correction.
6. Does it blur route evidence, recipient identity evidence, and payment execution? → Principle 6 blocks it.
7. Does it increase the evidence available to users, or does it ask them to trust ImplicitEx instead? → Principle 7 is the test.
8. Does this feature belong to the payment instrument or the inspection console? → Principle 8 (product boundary) decides first. Within the instrument: does it belong to the identity shell or the transaction surface? → Principle 8 (implementation boundary) decides second. Does the Portal become required at any point in the payment path? → Principle 8 blocks it regardless of where the code lives.
9. Can the sender complete the normal happy path without leaving the primary surface? → Principle 9 is the test. If a secondary surface is required, the primary surface has been displaced.
10. Does this improvement require changes to more than one independent implementation? → Principle 10 flags a missing single authority. Does this feature put platform capability inside a UI surface? → Principle 10 blocks it: no surface may become the authority for a platform capability.

Proposals that strengthen these principles should be prioritized. Proposals that require violating them require an architectural argument, not just a product argument.

---

## The unifying philosophy

All ten principles are expressions of two related ideas, in order:

> **Every responsibility has one natural owner.**

> **Move responsibility to the layer that naturally owns it.**

The order matters. The first question is identification: who should own this? Only after that is answered does reorganization begin. Skipping the first question turns architectural work into a game of moving code between folders — the code moves, but the responsibility stays wherever it happened to land.

| Responsibility | Natural owner |
|---|---|
| Typographic role | Semantic type system |
| Recipient identity | Manifest / registry |
| Transfer execution | Coin Card (payment instrument) |
| Inspection and verification | Transfer Portal (console) |
| Execution mechanics | Execution Service (platform) |
| Manifest validation | Registry Service (platform) |
| Receipt lifecycle | Receipt Service (platform) |
| State transitions | State Service (platform) |

When responsibility is in the right layer, improvements in that layer propagate to all consumers. When responsibility is in the wrong layer — UI code owning business logic, surfaces owning platform capabilities — improvements are local, drift is inevitable, and the system becomes harder to reason about with each addition.

**The methodology these principles produce:**

1. Find the smallest inconsistency.
2. Identify the responsibility involved.
3. Determine its natural owner.
4. Move the responsibility.
5. Remove the duplicate.
6. Repeat.

This is not a refactoring procedure. It is how the product develops. Every improvement in this system — semantic typography, identity leading address, Coin Card as instrument, Portal as console, Execution Service, Registry Service — followed the same six steps. The architecture simplifies rather than grows because each step removes an ambiguity rather than adding a capability.

**The doctrine is predictive, not descriptive.** It does not only record decisions that have been made. It answers questions before code is written. "Should Safe support be implemented in Coin Card?" — No. Safe is an execution capability. It belongs in the Execution Service. Coin Card consumes it. That answer requires no discussion because the principle already resolved it. That is the sign of a mature architectural doctrine: it reduces future design uncertainty rather than cataloguing past decisions.
