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

## How to use these principles

These principles answer future questions before they arise. When a feature is proposed:

1. Does it require wallet execution on a surface ImplicitEx does not control? → Principle 1 blocks it.
2. Does it introduce analytics that activate without consent or could interrupt a transfer? → Principle 2 blocks it.
3. Does it move the widget toward a payment engine rather than a distribution surface? → Principle 3 blocks it.
4. Does it make claims that cannot be verified on-chain or through public records? → Principle 4 blocks it.
5. Does it create a new brand surface that is disconnected from the entity graph? → Principle 5 flags it for correction.

Proposals that strengthen these principles should be prioritized. Proposals that require violating them require an architectural argument, not just a product argument.
