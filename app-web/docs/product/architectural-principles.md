# ImplicitEx Architectural Principles

**Established:** 2026-06-23

These are not implementation details. They are constitutional rules that govern future product decisions. When a feature proposal arrives, the question is: does it strengthen these principles or weaken them?

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

Both products consume the same execution engine (`window.IX_EXECUTE`) independently. Neither calls the other.

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

Proposals that strengthen these principles should be prioritized. Proposals that require violating them require an architectural argument, not just a product argument.
