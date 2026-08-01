# ImplicitEx Comprehensive Roadmap Record Inventory

Date: 2026-07-30
Inventory revision: 0.2 — normalized founder-review draft
Planning horizon: Existing foundation through July 2027, with gated later doors
Status: Uncommitted review artifact; does not authorize implementation
Governing strategy: `docs/product/product-commercial-roadmap-2026-07-30.md`

## Why this inventory exists

The master roadmap governs sequence, boundaries, and evidence gates. This
inventory supplies the missing zoom layer: every material roadmap record, why
it exists, what value it creates, how it supports the strategy, what actually
exists, what remains, and what evidence permits the next move.

The document is deliberately more comprehensive than the V1 Execution
Checklist. The checklist remains a subordinate operating worksheet. This
inventory is the founder's orientation map.

## Authority and evidence rules

- A specification is not an implementation.
- Passing unit tests is not production verification.
- Production verification is not customer-value validation.
- Customer interest cannot bypass a binding security, legal, custody, privacy,
  or evidence-integrity gate.
- A strategically useful roadmap record may still have **no authorized next
  action**.
- Maturity and authorization are conservative. When repository branches or evidence disagree, the
  record is downgraded until the disagreement is resolved.
- This draft inventories decisions. It does not change the release order,
  pricing, custody boundary, or Do Not Build register.

## Audited source state

- Deployed inventory branch: `docs/product-commercial-roadmap-rev6` at
  `6bf1608`.
- Roadmap commit: `ec78178`.
- Canonical remote default: `origin/main` at `2cb9237`.
- Repository divergence: 17 commits exist only on `origin/main`; 79 commits
  exist only on the deployed inventory branch from merge base `9f4f2d`.
- A merge preview identifies 15 conflicts, including Coin Card execution,
  verification, manifest, and test files.
- Therefore, **canonical branch integration has a blocking effect on new production
  feature development and canonical redeployment**, and no record may assume the two trees are already
  reconciled.

## Implementation maturity vocabulary

- **Concept only**
- **Defined or specified**
- **Partially implemented**
- **Implemented and tested**
- **Release-evidenced**
- **Production-verified**
- **Customer-validated**
- **Approved governing record**
- **Superseded**

## Work authorization vocabulary

- **Active change**
- **Next authorized**
- **Ready but not queued**
- **Decision required**
- **Blocked by named dependency**
- **Evidence-gated**
- **Legally gated**
- **Deferred**
- **Excluded**

## Strategic phase map

```text
Existing production foundation
        ↓
Repository and authority reconciliation
        ↓
V1 controlled payment credential pilot
        ↓ evidence gate
V2 Gate 0: account, tenant, data, privacy, recovery
        ↓ binding gate
V2 Core: request → submit → verify → match → evidence → search/export
        ↓ repeated paid use
One V2 Expansion capability at a time
        ↓ measured blocker
At most one V3 workflow experiment + one V3 access experiment
        ↓ named paid demand
Horizontal expansion or a longer-horizon door
```

## Record format

Every full roadmap record contains the normalized fields required by the
founder control model. Maturity describes what exists. Authorization describes
whether work may proceed. Neither substitutes for the other.

## Parent-capability map

The 42 parent capabilities are the founder-facing zoom layer. Their child
records remain the authoritative implementation detail below.

### PC-01 — Roadmap and founder control system

- **Purpose:** Keep strategy, execution state, and founder decisions coherent.
- **User value:** The founder can see what matters now without losing the governing plan.
- **Strategic role:** Turns documentation into a bounded decision system rather than another backlog.
- **Aggregate maturity:** Mixed child state — 1 Defined or specified; 1 Release-evidenced; 1 Approved governing record.
- **Current authorization:** Active change
- **Major dependencies:** Approved roadmap, normalized inventory model, and artifact synchronization.
- **Exit evidence:** Founder approval, zero structural defects, and one active work package.
- **Child record IDs:** GOV-01, GOV-02, GOV-03
- **Next authorized work package:** WP-01

### PC-02 — Canonical source and release governance

- **Purpose:** Establish one authoritative source tree and an evidence-controlled release path.
- **User value:** Customers receive the intended verified build and can rely on rollback discipline.
- **Strategic role:** Prevents silent source divergence from invalidating payment and trust evidence.
- **Aggregate maturity:** Mixed child state — 2 Defined or specified; 1 Release-evidenced; 1 Approved governing record.
- **Current authorization:** Next authorized
- **Major dependencies:** Founder-approved inventory, exact conflict disposition, release suites, and deployment evidence.
- **Exit evidence:** Canonical branch integration, clean verification, deployed commit identity, and rollback proof.
- **Child record IDs:** GOV-04, GOV-05, GOV-06, GOV-07
- **Next authorized work package:** WP-02

### PC-03 — Non-custodial transfer contract and fee controls

- **Purpose:** Execute bounded Polygon USDC transfers without ImplicitEx custody.
- **User value:** A payer can authorize a deterministic transfer with explicit fee and asset limits.
- **Strategic role:** Supplies the proven execution rail beneath the payment-operations product.
- **Aggregate maturity:** Mixed child state — 1 Defined or specified; 5 Production-verified.
- **Current authorization:** Mixed child authorization — 1 Evidence-gated; 5 Deferred
- **Major dependencies:** Verified contract, allowlist, pause controls, interface limit, and fee-state accuracy.
- **Exit evidence:** Live transfer evidence and exact agreement among contract, interface, disclosure, and tests.
- **Child record IDs:** FND-01, FND-02, FND-03, FND-04, FND-05, FND-06
- **Next authorized work package:** Maintenance only

### PC-04 — Wallet access and execution continuity

- **Purpose:** Connect supported wallets while preserving account, chain, and provider continuity.
- **User value:** The payer can use a supported wallet without silent context drift.
- **Strategic role:** Keeps wallet authorization as the custody boundary while broadening access.
- **Aggregate maturity:** Mixed child state — 3 Implemented and tested; 1 Production-verified.
- **Current authorization:** Mixed child authorization — 3 Ready but not queued; 1 Deferred
- **Major dependencies:** Supported provider paths, wallet tests, and continuity invariants.
- **Exit evidence:** Supported-wallet matrix passes connection, dispatch, return, and drift scenarios.
- **Child record IDs:** FND-07, FND-08, FND-09, FND-10
- **Next authorized work package:** WP-05

### PC-05 — Transfer preflight, dispatch, and transaction state

- **Purpose:** Validate, submit, monitor, and classify a transfer without hiding uncertainty.
- **User value:** The payer knows what will happen and whether retrying is safe.
- **Strategic role:** Makes the commodity rail dependable enough to support managed payment workflows.
- **Aggregate maturity:** Mixed child state — 5 Production-verified.
- **Current authorization:** Mixed child authorization — 5 Deferred
- **Major dependencies:** Wallet continuity, exact arithmetic, simulation, receipt monitoring, and finality policy.
- **Exit evidence:** All success, rejection, failure, drift, pending, and uncertain scenarios remain evidence-backed.
- **Child record IDs:** FND-11, FND-12, FND-13, FND-14, FND-15
- **Next authorized work package:** WP-05

### PC-06 — Local receipt, proof, and activity foundation

- **Purpose:** Preserve local transaction context, evidence, and recent ImplicitEx activity.
- **User value:** The user can understand and retrieve a payment beyond an explorer hash.
- **Strategic role:** Provides the present evidence base that V2 will extend into request-linked operations.
- **Aggregate maturity:** Mixed child state — 2 Implemented and tested; 1 Production-verified.
- **Current authorization:** Mixed child authorization — 2 Ready but not queued; 1 Deferred
- **Major dependencies:** Verified transfer facts, schema integrity, local privacy boundaries, and export safety.
- **Exit evidence:** Local records survive refresh, detect tampering, and never overstate chain facts.
- **Child record IDs:** FND-16, FND-17, FND-18
- **Next authorized work package:** WP-05

### PC-07 — Modular portal, PWA, hosting, and build identity

- **Purpose:** Deliver a progressively disclosed payment workspace through a traceable web release.
- **User value:** Users see the right tool and status without becoming lost in a crowded dashboard.
- **Strategic role:** Creates the expandable portal shell while preserving mobile access and deployment truth.
- **Aggregate maturity:** Mixed child state — 1 Partially implemented; 4 Production-verified.
- **Current authorization:** Mixed child authorization — 1 Ready but not queued; 4 Deferred
- **Major dependencies:** Shared surfaces, responsive PWA, Firebase controls, security headers, and build metadata.
- **Exit evidence:** Portal/browser suites pass and the live custom domain identifies the canonical deployed commit.
- **Child record IDs:** FND-19, FND-20, FND-21, FND-22, FND-23
- **Next authorized work package:** WP-02

### PC-08 — Shared payment-object and portal model

- **Purpose:** Define stable profiles, contacts, cards, requests, transfers, evidence, templates, and exceptions.
- **User value:** The same payment remains understandable across summary, detail, action, and evidence views.
- **Strategic role:** Prevents the suite from becoming disconnected applications or contradictory records.
- **Aggregate maturity:** Mixed child state — 7 Defined or specified; 3 Partially implemented; 1 Implemented and tested.
- **Current authorization:** Mixed child authorization — 4 Ready but not queued; 1 Decision required; 6 Evidence-gated
- **Major dependencies:** Stable IDs, authoritative ownership, lifecycle, projections, and guarded customization.
- **Exit evidence:** Every view resolves to the same authoritative object and advanced views do not burden defaults.
- **Child record IDs:** OBJ-01, OBJ-02, OBJ-03, OBJ-04, OBJ-05, OBJ-06, OBJ-07, OBJ-08, OBJ-09, OBJ-10, OBJ-11
- **Next authorized work package:** V2 Gate 0

### PC-09 — Coin Card identity, manifest, and key authority

- **Purpose:** Authenticate the card identity, signed manifest, registry, and trusted key source.
- **User value:** A payer can verify which signed payment credential was actually published.
- **Strategic role:** Turns a public destination into a cryptographically bounded payment credential.
- **Aggregate maturity:** Mixed child state — 2 Defined or specified; 2 Partially implemented; 8 Implemented and tested.
- **Current authorization:** Mixed child authorization — 11 Ready but not queued; 1 Deferred
- **Major dependencies:** Canonical bytes, domains, signing authority, key rotation, registry authentication, and atomic bundles.
- **Exit evidence:** Cross-runtime fixtures and independent verification agree on identity, signature, and authorized key.
- **Child record IDs:** CC-01, CC-02, CC-03, CC-04, CC-05, CC-06, CC-07, CC-08, CC-09, CC-10, CC-11, CC-12
- **Next authorized work package:** WP-03 then WP-05

### PC-10 — Coin Card lifecycle and route authority

- **Purpose:** Resolve current, expired, suspended, revoked, replaced, and stale credential states.
- **User value:** A payer can tell whether the route is presently authorized and how it changed.
- **Strategic role:** Adds route lineage and revocation evidence beyond a simple mutable name.
- **Aggregate maturity:** Mixed child state — 1 Defined or specified; 10 Implemented and tested.
- **Current authorization:** Mixed child authorization — 10 Ready but not queued; 1 Decision required
- **Major dependencies:** Publication authority, signed lifecycle records, temporal rules, rollback protection, and display contract.
- **Exit evidence:** The same signed history produces the same lifecycle result and fail-closed presentation.
- **Child record IDs:** CC-13, CC-14, CC-15, CC-16, CC-17, CC-18, CC-19, CC-20, CC-21, CC-22, CC-23
- **Next authorized work package:** WP-03 then WP-05

### PC-11 — Coin Card execution authorization and evidence verification

- **Purpose:** Bind executable route authority, wallet context, deployed contract facts, and transaction evidence.
- **User value:** The payer can review the exact authorized route and a third party can verify what settled.
- **Strategic role:** Creates the portable chain of evidence around execution without promising insurance.
- **Aggregate maturity:** Mixed child state — 1 Defined or specified; 1 Partially implemented; 8 Implemented and tested.
- **Current authorization:** Mixed child authorization — 10 Ready but not queued
- **Major dependencies:** Replay defense, provider continuity, descriptor identity, route-version preservation, and verifier parity.
- **Exit evidence:** Independent verification reproduces authorization and settlement from immutable inputs.
- **Child record IDs:** CC-24, CC-25, CC-26, CC-27, CC-28, CC-29, CC-30, CC-31, CC-32, CC-33
- **Next authorized work package:** WP-05

### PC-12 — Hosted Coin Card presentation and handoff

- **Purpose:** Publish and embed a legible credential that hands off only verified payment facts.
- **User value:** Recipients can share one destination and payers can enter a clear review flow.
- **Strategic role:** Provides the distribution surface for the controlled V1 credential pilot.
- **Aggregate maturity:** Mixed child state — 1 Partially implemented; 1 Implemented and tested; 2 Release-evidenced.
- **Current authorization:** Mixed child authorization — 2 Ready but not queued; 2 Deferred
- **Major dependencies:** Hosted artifact, iframe boundary, handoff contract, QR presentation, and mobile/browser verification.
- **Exit evidence:** Live card and embed resolve the same authorized state and cannot bypass the review path.
- **Child record IDs:** CC-34, CC-35, CC-36, CC-37
- **Next authorized work package:** WP-05

### PC-13 — Controlled Coin Card issuance and recovery

- **Purpose:** Issue, reverify, suspend, replace, and recover pilot credentials through controlled operations.
- **User value:** A recipient receives a maintained credential instead of a one-time static page.
- **Strategic role:** Tests whether lifecycle maintenance is valuable and supportable before self-service issuance.
- **Aggregate maturity:** Mixed child state — 3 Defined or specified; 1 Partially implemented.
- **Current authorization:** Mixed child authorization — 3 Ready but not queued; 1 Decision required
- **Major dependencies:** Wallet challenge, entitlement, namespace, audit history, support, and compromise procedures.
- **Exit evidence:** The founder can operate every lifecycle event from a rehearsed runbook without improvisation.
- **Child record IDs:** CC-38, CC-39, CC-40, CC-41
- **Next authorized work package:** WP-06

### PC-14 — V1 governing decisions and release boundaries

- **Purpose:** Ratify signed-record, security, data, custody, entitlement, screening, and credential policies.
- **User value:** Pilot users receive one coherent product whose behavior matches its stated boundaries.
- **Strategic role:** Prevents implementation from outrunning authority, privacy, or legal decisions.
- **Aggregate maturity:** Mixed child state — 10 Defined or specified; 1 Partially implemented.
- **Current authorization:** Mixed child authorization — 8 Ready but not queued; 2 Decision required; 1 Legally gated
- **Major dependencies:** Founder decisions, counsel determinations where required, source authority, and release criteria.
- **Exit evidence:** Every governing question has a dated decision, owner, tests, and hard deployment gate.
- **Child record IDs:** V1-01, V1-02, V1-03, V1-04, V1-05, V1-06, V1-07, V1-08, V1-09, V1-10, V1-11
- **Next authorized work package:** WP-03 then WP-04

### PC-15 — V1 pilot operations and incident readiness

- **Purpose:** Rehearse issuance, lifecycle, support, uncertainty, incidents, rollback, and findings.
- **User value:** Pilot users receive consistent help and truthful status when normal execution breaks.
- **Strategic role:** Makes the pilot an operable service rather than a founder-controlled demo.
- **Aggregate maturity:** Mixed child state — 7 Defined or specified; 2 Partially implemented.
- **Current authorization:** Mixed child authorization — 9 Ready but not queued
- **Major dependencies:** Approved policies, runbooks, evidence store, administrative controls, and rehearsal environment.
- **Exit evidence:** All critical paths and failures are rehearsed, findings are dispositioned, and communications are ready.
- **Child record IDs:** V1-12, V1-13, V1-14, V1-15, V1-16, V1-17, V1-18, V1-19, V1-20
- **Next authorized work package:** WP-04 then WP-06

### PC-16 — V1 customer and commercial evidence

- **Purpose:** Collect qualified interviews, offers, placements, real payments, and a final disposition.
- **User value:** The product advances only when it solves a real workflow for genuine users.
- **Strategic role:** Replaces founder intuition and sunk cost with explicit continue, narrow, pivot, or stop evidence.
- **Aggregate maturity:** Mixed child state — 6 Defined or specified.
- **Current authorization:** Mixed child authorization — 6 Evidence-gated
- **Major dependencies:** Approved evidence boundaries, qualified cohort, offer, issued credentials, and pilot readiness.
- **Exit evidence:** Reviewed customer evidence supports an explicit V1 disposition without bypassing binding gates.
- **Child record IDs:** V1-21, V1-22, V1-23, V1-24, V1-25, V1-26
- **Next authorized work package:** WP-07 then WP-08

### PC-17 — V2 authentication, tenant, and authorization foundation

- **Purpose:** Create secure accounts, workspaces, authorization, sessions, and audit logs.
- **User value:** An operator can maintain private payment records without exposing another customer's data.
- **Strategic role:** Enables paid workspaces without weakening wallet self-custody.
- **Aggregate maturity:** Mixed child state — 8 Defined or specified.
- **Current authorization:** Mixed child authorization — 8 Evidence-gated
- **Major dependencies:** Positive V1 disposition, threat model, stable object ownership, and administrative controls.
- **Exit evidence:** Isolation, recovery, authorization, session, and audit tests pass before customer data is stored.
- **Child record IDs:** G0-01, G0-02, G0-03, G0-04, G0-05, G0-06, G0-07, G0-08
- **Next authorized work package:** V2 Gate 0

### PC-18 — V2 data, privacy, backup, and recovery foundation

- **Purpose:** Classify, minimize, retain, export, delete, back up, and recover private customer data.
- **User value:** Customers understand and control eligible data while their operational records remain durable.
- **Strategic role:** Preserves the lightweight trust position as ImplicitEx becomes an account platform.
- **Aggregate maturity:** Mixed child state — 11 Defined or specified.
- **Current authorization:** Mixed child authorization — 11 Evidence-gated
- **Major dependencies:** Positive V1 disposition, data-flow map, counsel where required, and tenant model.
- **Exit evidence:** Deletion/export work, restoration is rehearsed, and disclosure matches actual collection.
- **Child record IDs:** G0-09, G0-10, G0-11, G0-12, G0-13, G0-14, G0-15, G0-16, G0-17, G0-18, G0-19
- **Next authorized work package:** V2 Gate 0

### PC-19 — Billing, entitlement, onboarding, and unit economics

- **Purpose:** Sell a predictable paid workspace and bounded setup service with known support margin.
- **User value:** The operator can buy the service they receive without an unexplained sender toll.
- **Strategic role:** Tests the focused-challenger business model independently of the deployed 1% fee.
- **Aggregate maturity:** Mixed child state — 5 Defined or specified.
- **Current authorization:** Mixed child authorization — 5 Evidence-gated
- **Major dependencies:** Positive V1 paid signal, Gate 0, billing-data separation, support process, and cost instrumentation.
- **Exit evidence:** Billing lifecycle works, setup produces independent use, and cohort gross margin is positive.
- **Child record IDs:** V2C-01, V2C-02, V2C-03, V2C-25, V2C-26
- **Next authorized work package:** V2 Core

### PC-20 — Signed payment requests and frozen execution intent

- **Purpose:** Authenticate amount, purpose, route, expiry, and request identity through wallet handoff.
- **User value:** A payer receives one coherent instruction instead of separate address and amount messages.
- **Strategic role:** Creates the core request layer above commodity stablecoin movement.
- **Aggregate maturity:** Mixed child state — 10 Defined or specified.
- **Current authorization:** Mixed child authorization — 10 Evidence-gated
- **Major dependencies:** V1 signed-record ratification, Gate 0, Coin Card authority, canonical schema, and safe links.
- **Exit evidence:** The request shown, signed, submitted, and preserved is byte-consistent and replay-safe.
- **Child record IDs:** V2C-04, V2C-05, V2C-06, V2C-07, V2C-08, V2C-09, V2C-10, V2C-11, V2C-12, V2C-13
- **Next authorized work package:** V2 Core

### PC-21 — Authoritative matching, watcher, and reconciliation

- **Purpose:** Verify known submissions and distinguish authoritative, suggested, and uncertain matches.
- **User value:** The operator knows which obligation was actually paid and which cases require review.
- **Strategic role:** Transforms raw chain transfers into evidence-derived payment operations.
- **Aggregate maturity:** Mixed child state — 8 Defined or specified.
- **Current authorization:** Mixed child authorization — 8 Evidence-gated
- **Major dependencies:** Captured transaction hash, minimal watcher, receipt/event verification, idempotency, and reorg handling.
- **Exit evidence:** All match labels derive from provenance; amount plus address is never authoritative.
- **Child record IDs:** V2C-14, V2C-15, V2C-16, V2C-17, V2C-18, V2C-19, V2C-20, V2C-21
- **Next authorized work package:** V2 Core

### PC-22 — Request-linked evidence, search, and export

- **Purpose:** Preserve a portable request-to-settlement artifact and make records searchable/exportable.
- **User value:** Operators and third parties can retrieve, inspect, and reuse understandable payment records.
- **Strategic role:** Provides ongoing administrative value beyond a one-time transfer.
- **Aggregate maturity:** Mixed child state — 3 Defined or specified.
- **Current authorization:** Mixed child authorization — 3 Evidence-gated
- **Major dependencies:** Verified matching, stable objects, tenant authorization, safe search, and formula-safe export.
- **Exit evidence:** Every result and export row traces to authoritative evidence and survives independent verification.
- **Child record IDs:** V2C-22, V2C-23, V2C-24
- **Next authorized work package:** V2 Core

### PC-23 — Retention and repeat-payment tools

- **Purpose:** Reduce repeated setup and help operators manage recurring, partial, excess, duplicate, and open-amount workflows.
- **User value:** The operator spends less time reconstructing obligations and investigating exceptions.
- **Strategic role:** Adds retention only after V2 Core reveals the highest repeated-work blocker.
- **Aggregate maturity:** Mixed child state — 11 Defined or specified.
- **Current authorization:** Mixed child authorization — 11 Evidence-gated
- **Major dependencies:** Stable V2 records, privacy approval, observed repeated pain, and one-at-a-time selection.
- **Exit evidence:** The selected tool measurably improves retention, completion, or support without creating new ambiguity.
- **Child record IDs:** V2E-01, V2E-02, V2E-03, V2E-04, V2E-05, V2E-06, V2E-07, V2E-08, V2E-15, V2E-16, V2E-17
- **Next authorized work package:** V2 Expansion

### PC-24 — Analytics, presentation, and bounded verification claims

- **Purpose:** Add privacy-bounded insight, curated presentation, and exact social/domain control claims.
- **User value:** Operators can understand use and present trustworthy context without enterprise machinery.
- **Strategic role:** Creates paid retention and identity value after demand, without arbitrary customization or identity overclaiming.
- **Aggregate maturity:** Mixed child state — 6 Defined or specified.
- **Current authorization:** Mixed child authorization — 6 Evidence-gated
- **Major dependencies:** V2 Core, PII approval, claim provenance, accessibility, expiry, and correction paths.
- **Exit evidence:** Every metric and claim has a source and every presentation preserves signed payment facts.
- **Child record IDs:** V2E-09, V2E-10, V2E-11, V2E-12, V2E-13, V2E-14
- **Next authorized work package:** V2 Expansion

### PC-25 — Bounded operational intelligence

- **Purpose:** Provide factual search, exception explanations, and draft actions linked to evidence.
- **User value:** Operators spend less time translating records into safe next steps.
- **Strategic role:** Tests premium administrative value without granting AI financial authority.
- **Aggregate maturity:** Mixed child state — 4 Defined or specified.
- **Current authorization:** Mixed child authorization — 4 Evidence-gated
- **Major dependencies:** Reliable V2 records, repeated analysis pain, tenant isolation, evaluation set, and provenance.
- **Exit evidence:** Material answers cite source records and no generated output can move funds or make unsupported claims.
- **Child record IDs:** V3W-02, V3W-03, V3W-04, V3W-05
- **Next authorized work package:** V3 workflow experiment

### PC-26 — Controlled payer scheduling and approvals

- **Purpose:** Prepare scheduled or team-reviewed payments while preserving final wallet authorization.
- **User value:** Payers can organize consequential payments without surrendering control.
- **Strategic role:** Tests the separate payer-side controlled-payment business after payee-side retention.
- **Aggregate maturity:** Mixed child state — 3 Defined or specified.
- **Current authorization:** Mixed child authorization — 3 Evidence-gated
- **Major dependencies:** Named payer demand, stable V2 records, role model, wallet revalidation, and Safe review where used.
- **Exit evidence:** Real workflows complete with fresh approval, full audit history, and no ImplicitEx initiation authority.
- **Child record IDs:** V3W-01, V3W-06, V3W-07
- **Next authorized work package:** V3 workflow experiment

### PC-27 — Embedded, QR, and POS request access

- **Purpose:** Deliver authenticated requests through embeds, return flows, QR, and in-person presentation.
- **User value:** Payers can enter a clear verified flow from the context where payment begins.
- **Strategic role:** Tests distribution channels only after signed request integrity is proven.
- **Aggregate maturity:** Mixed child state — 4 Defined or specified.
- **Current authorization:** Mixed child authorization — 4 Evidence-gated
- **Major dependencies:** V2 requests, origin/URL controls, browser/mobile testing, watcher status, and placement demand.
- **Exit evidence:** The selected channel improves completion without hiding signed terms or settlement state.
- **Child record IDs:** V3A-01, V3A-02, V3A-03, V3A-04
- **Next authorized work package:** V3 access experiment

### PC-28 — Recipient, naming, fiat-display, and wallet access

- **Purpose:** Reduce repeat-recipient, address, denomination, and wallet-access friction.
- **User value:** Payers can recognize and reselect a destination while still verifying the actual route.
- **Strategic role:** Tests measured access blockers without confusing convenience with identity.
- **Aggregate maturity:** Mixed child state — 5 Defined or specified.
- **Current authorization:** Mixed child authorization — 5 Evidence-gated
- **Major dependencies:** V2 history, current route verification, privacy boundaries, trusted data sources, and wallet demand.
- **Exit evidence:** The selected experiment improves completion and never bypasses the full review screen.
- **Child record IDs:** V3A-05, V3A-06, V3A-07, V3A-08, V3A-15
- **Next authorized work package:** V3 access experiment

### PC-29 — Gas abstraction and smart-account controls

- **Purpose:** Remove gas-token friction through a bounded, audited account/paymaster model.
- **User value:** A qualified payer can complete a USDC payment without separately acquiring gas.
- **Strategic role:** Tests a high-leverage funnel fix only after its actual attrition is measured.
- **Aggregate maturity:** Mixed child state — 3 Defined or specified.
- **Current authorization:** Mixed child authorization — 3 Evidence-gated
- **Major dependencies:** Measured gas blocker, current wallet review, authority model, audit, abuse controls, and economics.
- **Exit evidence:** A bounded pilot improves completion with positive economics and no unilateral ImplicitEx authority.
- **Child record IDs:** V3A-09, V3A-10, V3A-11
- **Next authorized work package:** V3 access experiment

### PC-30 — Licensed-partner fiat on-ramp access

- **Purpose:** Let users acquire USDC through a licensed provider that delivers to their wallet.
- **User value:** A payer can enter the supported workflow without ImplicitEx receiving fiat.
- **Strategic role:** Closes a measured access gap while preserving the partner and custody boundary.
- **Aggregate maturity:** Mixed child state — 3 Defined or specified.
- **Current authorization:** Mixed child authorization — 3 Evidence-gated
- **Major dependencies:** Acquisition evidence, provider diligence, counsel, redirect integrity, disclosure, and support routing.
- **Exit evidence:** A controlled corridor pilot has transparent fees/KYC and verified direct-to-wallet delivery.
- **Child record IDs:** V3A-12, V3A-13, V3A-14
- **Next authorized work package:** V3 access experiment

### PC-31 — Address-risk and sanctions operations

- **Purpose:** Determine and operate proportionate address-risk or sanctions controls.
- **User value:** Users and partners receive calibrated checks and a defined exception path.
- **Strategic role:** Protects legal/partner viability without making unsupported safety claims.
- **Aggregate maturity:** Mixed child state — 8 Defined or specified.
- **Current authorization:** Mixed child authorization — 8 Legally gated
- **Major dependencies:** Actual product flow, counsel determination, provider/source policy, privacy, and support capacity.
- **Exit evidence:** Required controls, freshness, outage, appeal, logging, and UI agree and pass release tests.
- **Child record IDs:** RISK-01, RISK-02, RISK-03, RISK-04, RISK-05, RISK-06, RISK-07, RISK-08
- **Next authorized work package:** WP-04 or later legal gate

### PC-32 — Legal release and maintenance governance

- **Purpose:** Trigger renewed counsel review and keep product, legal pages, tests, and jurisdiction claims synchronized.
- **User value:** Customers receive an accurately described service within supported availability.
- **Strategic role:** Separates internal research from legal clearance and makes legal maintenance operational.
- **Aggregate maturity:** Mixed child state — 4 Defined or specified.
- **Current authorization:** Mixed child authorization — 1 Ready but not queued; 2 Decision required; 1 Legally gated
- **Major dependencies:** Legal Development Hierarchy, product facts, counsel triggers, page inventory, and release checklist.
- **Exit evidence:** Every affected release records the required determination and cross-surface agreement.
- **Child record IDs:** RISK-09, RISK-10, RISK-11, RISK-12
- **Next authorized work package:** WP-03 then WP-04

### PC-33 — Platform APIs, teams, checkout, and recovery infrastructure

- **Purpose:** Open stable workflows to customer systems, teams, webhooks, checkout, and stronger recovery.
- **User value:** Businesses can integrate or collaborate when the lightweight manual workflow no longer suffices.
- **Strategic role:** Preserves platform doors without prematurely accepting their permanent support burden.
- **Aggregate maturity:** Mixed child state — 9 Concept only.
- **Current authorization:** Mixed child authorization — 9 Deferred
- **Major dependencies:** Stable V2 objects, inbound paid demand, versioning, auth, watcher/indexer need, and support capacity.
- **Exit evidence:** A selected door has named customers, compatibility evidence, security review, and sustainable support.
- **Child record IDs:** LH-03, LH-04, LH-05, LH-06, LH-07, LH-08, LH-09, LH-28, LH-29
- **Next authorized work package:** Longer-horizon door

### PC-34 — Advanced scheduled, recurring, batch, and split payments

- **Purpose:** Apply bounded rules to repeated or multi-recipient payments.
- **User value:** Payers can organize consequential obligations with less repetitive work.
- **Strategic role:** Preserves higher-value controlled-payment options behind explicit authority and audit gates.
- **Aggregate maturity:** Mixed child state — 4 Concept only.
- **Current authorization:** Mixed child authorization — 1 Legally gated; 3 Deferred
- **Major dependencies:** Named paid demand, audited contract/module architecture, revocation, recovery, and counsel.
- **Exit evidence:** The selected workflow proves value without custody, generic allowances, or ambiguous initiation authority.
- **Child record IDs:** LH-01, LH-02, LH-10, LH-11
- **Next authorized work package:** Longer-horizon door

### PC-35 — Business integrations, analysis, white label, and incentives

- **Purpose:** Extend proven operations into selected accounting, invoicing, analysis, partner-brand, or pricing workflows.
- **User value:** Operators gain one demanded adjacent capability without adopting an enterprise suite.
- **Strategic role:** Preserves monetization doors while protecting narrow scope and shared-core economics.
- **Aggregate maturity:** Mixed child state — 6 Concept only.
- **Current authorization:** Mixed child authorization — 1 Legally gated; 5 Deferred
- **Major dependencies:** Named paid demand, stable core, partner/legal review where needed, and margin evidence.
- **Exit evidence:** One selected capability produces repeat paid use without custom forks or unsupported claims.
- **Child record IDs:** LH-12, LH-13, LH-14, LH-15, LH-22, LH-23
- **Next authorized work package:** Longer-horizon door

### PC-36 — Portable naming, creator tools, and discovery

- **Purpose:** Add portable names, plugins, directory discovery, goals, and social proof for validated segments.
- **User value:** Recipients can distribute and contextualize payments where their customers already are.
- **Strategic role:** Preserves creator/network options behind namespace, privacy, moderation, and demand gates.
- **Aggregate maturity:** Mixed child state — 5 Concept only.
- **Current authorization:** Mixed child authorization — 5 Deferred
- **Major dependencies:** Segment traction, namespace policy, platform maintenance, moderation capacity, and privacy review.
- **Exit evidence:** A selected door shows measurable acquisition or conversion value with supportable abuse controls.
- **Child record IDs:** LH-16, LH-17, LH-18, LH-19, LH-20
- **Next authorized work package:** Longer-horizon door

### PC-37 — Regulated off-ramp, corridor, and card partnerships

- **Purpose:** Connect self-custodial stablecoin workflows to licensed cash-out or spending partners.
- **User value:** Eligible users can use stablecoin value beyond the wallet through a named regulated provider.
- **Strategic role:** Preserves the remittance/spend endgame without crossing the custody line internally.
- **Aggregate maturity:** Mixed child state — 3 Concept only.
- **Current authorization:** Mixed child authorization — 2 Legally gated; 1 Deferred
- **Major dependencies:** Proven volume, corridor demand, partner diligence, counsel, transparent economics, and support.
- **Exit evidence:** A partner-operated pilot works in a defined market with no ImplicitEx custody or issuer claim.
- **Child record IDs:** LH-21, LH-26, LH-27
- **Next authorized work package:** Longer-horizon door

### PC-38 — Native mobile and agent access

- **Purpose:** Offer deeper device or machine access only when the PWA/API is a proven constraint.
- **User value:** Qualified users or systems gain a more direct interaction path.
- **Strategic role:** Keeps emerging access options visible without creating speculative codebases.
- **Aggregate maturity:** Mixed child state — 2 Concept only.
- **Current authorization:** Mixed child authorization — 2 Deferred
- **Major dependencies:** Measured access blocker, current platform/standard review, authority model, budget, and paid demand.
- **Exit evidence:** The selected path solves a named limitation with safe authorization and sustainable maintenance.
- **Child record IDs:** LH-24, LH-25
- **Next authorized work package:** Longer-horizon door

### PC-39 — Stablecoin asset expansion

- **Purpose:** Add individually approved stablecoins through a delistable asset registry.
- **User value:** Customers can use the stablecoin their proven workflow already requires.
- **Strategic role:** Expands coverage only after USDC vertical value is established.
- **Aggregate maturity:** Mixed child state — 6 Concept only.
- **Current authorization:** Mixed child authorization — 6 Evidence-gated
- **Major dependencies:** Paid asset demand, current issuer/legal facts, registry foundation, liquidity, tests, and support.
- **Exit evidence:** Each asset passes an independent release matrix and can be disabled without breaking history.
- **Child record IDs:** HX-01, HX-02, HX-03, HX-04, HX-05, HX-06
- **Next authorized work package:** Horizontal expansion

### PC-40 — Chain, cross-chain, and wallet expansion

- **Purpose:** Add selected chains, native cross-chain paths, embedded wallets, and their operating controls.
- **User value:** Customers can use proven workflows from the networks and wallets they already use.
- **Strategic role:** Expands reach only after the payment-operations proposition retains on one chain.
- **Aggregate maturity:** Mixed child state — 6 Concept only.
- **Current authorization:** Mixed child authorization — 4 Evidence-gated; 1 Legally gated; 1 Deferred
- **Major dependencies:** Named paid demand, per-chain security/operations, custody review, release matrix, and support.
- **Exit evidence:** Each selected platform has full execution, evidence, observability, rollback, and support parity.
- **Child record IDs:** HX-07, HX-08, HX-09, HX-10, HX-11, HX-12
- **Next authorized work package:** Horizontal expansion

### PC-41 — Buyer, segment, retention, and sequencing evidence

- **Purpose:** Validate the independent-operator buyer, payee-first wedge, retention, and vertical-first sequence.
- **User value:** Product effort stays concentrated on a workflow real customers repeatedly value.
- **Strategic role:** Prevents user counts, competitor imitation, or horizontal breadth from replacing commercial evidence.
- **Aggregate maturity:** Mixed child state — 1 Concept only; 3 Defined or specified; 2 Approved governing record.
- **Current authorization:** Mixed child authorization — 4 Ready but not queued; 1 Evidence-gated; 1 Deferred
- **Major dependencies:** Qualified customer records, current competitor facts, retention events, and separate payer/payee cohorts.
- **Exit evidence:** Repeated paid behavior supports the chosen segment and an explicit next-phase decision.
- **Child record IDs:** COM-01, COM-02, COM-10, COM-12, COM-13, COM-14
- **Next authorized work package:** WP-07 then WP-08

### PC-42 — Pricing, revenue, refunds, and support economics

- **Purpose:** Test understandable prices and prove the service remains supportable.
- **User value:** The buyer knows what service they purchased and is not charged for hidden or commodity value.
- **Strategic role:** Makes lower price an economic advantage rather than a race to the bottom.
- **Aggregate maturity:** Mixed child state — 8 Defined or specified.
- **Current authorization:** Mixed child authorization — 1 Ready but not queued; 3 Decision required; 4 Evidence-gated
- **Major dependencies:** Defined service bundle, billing evidence, fee/refund policy, revenue records, and support time.
- **Exit evidence:** Paid conversion, retention, realized revenue, and positive margin support the selected model.
- **Child record IDs:** COM-03, COM-04, COM-05, COM-06, COM-07, COM-08, COM-09, COM-11
- **Next authorized work package:** WP-07


## Ordered V1 critical path

Exactly one work package may be active. A later package may be prepared, but
it cannot become active until the preceding package's exit evidence is
recorded. The sole exception is the bounded WP-02 decision-escalation loop:
WP-02 pauses without closing, one named WP-03 governing decision becomes the
only active work, and control returns to WP-02 immediately after that decision
is ratified and recorded. This exception does not activate the remainder of
WP-03 or authorize WP-04.

### WP-01 — Inventory normalization and founder approval

- **State:** Active change
- **Purpose:** Freeze a usable roadmap model before technical work resumes.
- **Included parent capabilities:** PC-01
- **Included detailed records:** GOV-01, GOV-06
- **Entry conditions:** Revision 6 and the 289-record founder-review draft exist.
- **Exit evidence:** Founder approves record classes, two-axis state, parent map,
  critical path, evidence locators, and audit with no structural defects.
- **Blockers:** None.
- **Unlocks:** WP-02.
- **Next authorized package:** WP-02 — Canonical repository integration.

### WP-02 — Canonical repository integration

- **State:** Next authorized
- **Purpose:** Reconcile the divergent production-documentation and canonical
  source histories without guessing across payment-critical conflicts.
- **Included parent capabilities:** PC-02, PC-07
- **Included detailed records:** GOV-04, GOV-07, FND-22
- **Entry conditions:** WP-01 founder approval and a clean inventory-only
  worktree.
- **Exit evidence:** Dedicated integration history; all 15 conflicts explicitly
  dispositioned; full Coin Card, portal, contract, and artifact suites pass;
  canonical branch contains the approved tree; clean rebuild and production
  verification identify the integrated commit.
- **Blockers:** None external. The divergent 17/79 histories and 15 conflicts
  are the work of this package, not a reason to wait.
- **Stop rule:** If a conflict requires choosing a new or unresolved authority,
  custody, lifecycle, execution, evidence, privacy, or legal design—not merely
  reconciling already approved behavior—stop that conflict, preserve the
  competing states, and move the decision into WP-03. Never make product-
  governance decisions silently through merge resolution.
- **Decision-escalation loop:** WP-02 pauses without closing; one named,
  bounded WP-03 decision becomes the sole active work; after ratification and
  evidence recording, that decision closes and control returns to WP-02. The
  remainder of WP-03 stays queued until WP-02's full exit evidence is recorded.
- **Unlocks:** One authoritative source for all V1 decisions and implementation.
- **Next authorized package:** WP-03 — V1 governing-decision ratification.

### WP-03 — V1 governing-decision ratification

- **State:** Ready but not queued
- **Purpose:** Ratify authority, namespace, data, custody, validity, and legal
  release rules before completing the credential path.
- **Included parent capabilities:** PC-09, PC-10, PC-14, PC-32
- **Included detailed records:** GOV-05, CC-03, V1-01, V1-06, V1-07, V1-09,
  V1-11, RISK-09, RISK-11
- **Entry conditions:** Normal activation requires WP-02 canonical source and
  exact current-state audit. During the bounded escalation exception, only the
  named decision activates; all other WP-03 work stays queued, and control
  returns to WP-02 when that decision is ratified and recorded.
- **Exit evidence:** Dated decisions, owners, schemas/policies, counsel triggers,
  tests to be enforced, and deployment gates are recorded without reopening
  product strategy.
- **Blockers:** A counsel-dependent question may block public activation, but
  it does not block reversible internal specification work.
- **Unlocks:** Security review can test one authoritative design.
- **Next authorized package:** WP-04 — Production-security closure.

### WP-04 — Production-security closure

- **State:** Ready but not queued
- **Purpose:** Close production dependencies, administrative security,
  served-content integrity, legal synchronization, and findings.
- **Included parent capabilities:** PC-02, PC-14, PC-15, PC-31, PC-32
- **Included detailed records:** V1-02, V1-03, V1-04, V1-05, V1-08, V1-20,
  RISK-01, RISK-10, RISK-12
- **Entry conditions:** WP-03 decisions define the system and release boundary.
- **Exit evidence:** Gate 1A is closed or formally superseded; administrative
  accounts are hardened; integrity monitoring and incident alerts work;
  security findings are resolved/accepted with owner; required counsel
  determination is recorded; legal pages, behavior, procedures, and tests agree.
- **Blockers:** Required external counsel determination, if not available, is a
  named legal blocker to deployment—not to internal remediation.
- **Unlocks:** Production credential/evidence completion against approved gates.
- **Next authorized package:** WP-05 — Credential and evidence-path completion.

### WP-05 — Credential and evidence-path completion

- **State:** Ready but not queued
- **Purpose:** Complete wallet control, signed route, lifecycle, execution
  authorization, governing route preservation, and independent verification.
- **Included parent capabilities:** PC-04, PC-05, PC-06, PC-09, PC-10, PC-11,
  PC-12
- **Included detailed records:** CC-04 through CC-37, plus FND-08 through
  FND-18 where their named hardening is required by the Coin Card path.
- **Entry conditions:** WP-04 release/security closure and canonical source.
- **Exit evidence:** One production path proves wallet control, authenticated
  route/lifecycle, fail-closed execution, provider continuity, transaction
  evidence, governing route version, and independent verification from
  immutable artifacts.
- **Blockers:** No external blocker is assumed; any new counsel question returns
  to WP-03/WP-04 without widening scope.
- **Unlocks:** Repeatable controlled issuance and lifecycle operations.
- **Next authorized package:** WP-06 — Pilot-operations readiness.

### WP-06 — Pilot-operations readiness

- **State:** Ready but not queued
- **Purpose:** Make issuance, reverification, support, compromise, suspension,
  revocation, replacement, rollback, and communication repeatable.
- **Included parent capabilities:** PC-13, PC-15, PC-31, PC-32
- **Included detailed records:** CC-38 through CC-41; V1-10, V1-12 through
  V1-19; RISK-02 through RISK-08 if counsel requires screening controls.
- **Entry conditions:** WP-05 credential/evidence path is production-ready.
- **Exit evidence:** Controlled cohort and entitlement are approved; every
  lifecycle and incident runbook is rehearsed; support/evidence stores are
  ready; no critical finding remains; customer communications are approved.
- **Blockers:** A screening control is included only when RISK-01 requires it;
  otherwise it remains outside the package.
- **Unlocks:** Real controlled placements and third-party payments.
- **Next authorized package:** WP-07 — Controlled pilot and customer evidence.

### WP-07 — Controlled pilot and customer-evidence collection

- **State:** Ready but not queued
- **Purpose:** Test whether qualified independent operators place, use, reuse,
  and value the controlled credential and surrounding service.
- **Included parent capabilities:** PC-16, PC-41, PC-42
- **Included detailed records:** V1-21 through V1-25; COM-01, COM-03 through
  COM-11
- **Entry conditions:** WP-06 readiness signoff and approved evidence/privacy
  boundaries.
- **Exit evidence:** Qualified interviews, priced offers, controlled placements,
  genuine third-party payments, repeat-use/support/cost evidence, and source-
  linked customer records are reviewed against working thresholds.
- **Blockers:** Customer participation is an evidence dependency; low response
  is evidence to narrow or stop, not a reason to manufacture activity.
- **Unlocks:** Evidence-based V1 disposition.
- **Next authorized package:** WP-08 — V1 disposition.

### WP-08 — V1 disposition

- **State:** Ready but not queued
- **Purpose:** Decide whether to advance to V2 Gate 0, continue evidence,
  narrow/change segment, or stop.
- **Included parent capabilities:** PC-01, PC-16, PC-41, PC-42
- **Included detailed records:** V1-26, COM-02, COM-10, COM-13, COM-14
- **Entry conditions:** WP-07 evidence is complete enough for a decision and
  every binding security/legal gate is satisfied.
- **Exit evidence:** A dated disposition names the evidence, failed or passed
  gates, authorized next phase, exclusions, and explicit no-work list.
- **Blockers:** Unresolved binding security, legal, custody, or evidence-
  integrity gates prevent advancement.
- **Unlocks:** V2 Gate 0 only if explicitly approved.
- **Next authorized package:** None until the disposition is recorded.


---

# 0. Roadmap, authority, and production governance

### GOV-01 — Comprehensive roadmap record inventory

- **Record class:** Governance decision
- **Parent capability:** PC-01 — Roadmap and founder control system
- **Area / phase / side / type:** Governance / V1 / internal / decision system
- **Implementation maturity:** Defined or specified
- **Work authorization:** Active change
- **Purpose:** Preserve the big picture while detailed work is underway; gives the founder one place to see why each implementation exists, how it is gated, and when to continue, pivot, or stop.
- **Parent user value:** The founder can see what matters now without losing the governing plan.
- **Parent strategic role:** Turns documentation into a bounded decision system rather than another backlog.
- **Strategic-role tags:** Governance
- **Current implementation:** Revision 6 and the capability register provide the strategy.
- **Remaining work:** This draft expands them into implementation-level records. Founder review, status correction, coverage audit, and final information architecture remain.
- **Dependencies:** Must agree with the master roadmap, canonical trust contracts, repository evidence, and the last 24 hours of decisions.
- **Entry gate:** This is the only active work package during normalization.
- **Completion evidence:** Complete when every material implementation is represented, source-linked, conservatively statused, and approved by the founder.
- **Commercial hypothesis:** This is operational infrastructure, not a customer feature.
- **Boundary:** Stop expanding the inventory when additional detail no longer changes a decision or next action.
- **Stop rule:** Stop expanding the inventory when additional detail no longer changes a decision or next action.
- **Source / evidence locator:** Master roadmap, capability register, repository, and this conversation.
- **Next action:** founder reviews this inventory through the local,
  uncommitted projection before committed or publishable HTML/PDF work.

### GOV-02 — Master roadmap Revision 6

- **Record class:** Governance decision
- **Parent capability:** PC-01 — Roadmap and founder control system
- **Area / phase / side / type:** Governance / all phases / internal / governing strategy
- **Implementation maturity:** Approved governing record
- **Work authorization:** Deferred
- **Purpose:** Controls buyer, sequence, pricing hypotheses, release gates, custody boundary, exclusions, and kill criteria.
- **Parent user value:** The founder can see what matters now without losing the governing plan.
- **Parent strategic role:** Turns documentation into a bounded decision system rather than another backlog.
- **Strategic-role tags:** Governance
- **Current implementation:** Approved and committed at `ec78178`; it remains intentionally strategic rather than implementation-complete.
- **Remaining work:** No active feature work is authorized; preserve and maintain the evidenced behavior unless a later gate opens a change.
- **Dependencies:** Any change to release scope, custody, pricing bands, binding gates, or sequence requires an explicit roadmap revision and evidence review.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Any change to release scope, custody, pricing bands, binding gates, or sequence requires an explicit roadmap revision and evidence review.
- **Commercial hypothesis:** Protects the $25,000 objective from feature drift.
- **Boundary:** Do not rewrite it merely to accommodate an implementation already built.
- **Stop rule:** Do not rewrite it merely to accommodate an implementation already built.
- **Source / evidence locator:** `docs/product/product-commercial-roadmap-2026-07-30.md`; commit `ec78178`; `docs/operations/evidence/product-commercial-roadmap-revision-6-final-review-2026-07-30.md`.
- **Next action:** none unless this inventory exposes a genuine contradiction.

### GOV-03 — V1 Execution Checklist

- **Record class:** Operational process
- **Parent capability:** PC-01 — Roadmap and founder control system
- **Area / phase / side / type:** Operations / V1 / internal / operating worksheet
- **Implementation maturity:** Release-evidenced
- **Work authorization:** Deferred
- **Purpose:** Converts V1 gates into a printable and browser-local checklist without replacing the comprehensive roadmap.
- **Parent user value:** The founder can see what matters now without losing the governing plan.
- **Parent strategic role:** Turns documentation into a bounded decision system rather than another backlog.
- **Strategic-role tags:** Governance
- **Current implementation:** Live HTML, 32 local-only checklist items, and a clean five-page PDF at `6bf1608`; public by deliberate founder classification. It remains intentionally narrow.
- **Remaining work:** No active feature work is authorized; preserve and maintain the evidenced behavior unless a later gate opens a change.
- **Dependencies:** Must stay synchronized with V1 gate decisions. The PDF must ignore browser-local state and reproduce from committed source.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Must stay synchronized with V1 gate decisions. The PDF must ignore browser-local state and reproduce from committed source.
- **Commercial hypothesis:** No direct revenue role.
- **Boundary:** Do not expand it into a second roadmap; link it from the future comprehensive page.
- **Stop rule:** Do not expand it into a second roadmap; link it from the future comprehensive page.
- **Source / evidence locator:** `app-web/frontend/public/v1-execution.html`; `app-web/frontend/public/js/v1-execution.js`; commit `6bf1608`.
- **Next action:** none.

### GOV-04 — Canonical repository integration

- **Record class:** Operational process
- **Parent capability:** PC-02 — Canonical source and release governance
- **Area / phase / side / type:** Production governance / V1 / internal / source authority
- **Implementation maturity:** Defined or specified
- **Work authorization:** Next authorized
- **Purpose:** Ensure future deployments cannot erase the roadmap artifact or silently select one of two divergent Coin Card implementations.
- **Parent user value:** Customers receive the intended verified build and can rely on rollback discipline.
- **Parent strategic role:** Prevents silent source divergence from invalidating payment and trust evidence.
- **Strategic-role tags:** Governance; Security/assurance; Support/operations
- **Current implementation:** `origin/main` is canonical, but production was deployed from `6bf1608`. The histories diverge 17/79 and the merge preview identifies 15 payment-critical conflicts.
- **Remaining work:** A dedicated integration branch, conflict resolution, full release evidence, and canonical deployment record remain.
- **Dependencies:** Requires an explicit integration plan; exact conflict disposition; complete Coin Card, portal, and artifact suites; deployed-tree comparison; clean rebuild; and production smoke.
- **Entry gate:** Founder approval of this normalized inventory.
- **Completion evidence:** Complete when canonical `main` contains the approved combined tree and the live deployment identifies that commit.
- **Commercial hypothesis:** Prevents operational rollback and contradictory source authority.
- **Boundary:** Never resolve conflicts by automatically choosing one branch across security-sensitive files.
- **Stop rule:** Never resolve conflicts by automatically choosing one branch across security-sensitive files.
- **Source / evidence locator:** Git topology: `origin/main` at `2cb9237`; deployed branch `docs/product-commercial-roadmap-rev6` at `6bf1608`; merge base `9f4f2d`; 17/79 divergent commits and 15 previewed conflicts as audited 2026-07-30.
- **Next action:** separate evidence-controlled integration task; not part of inventory drafting.

### GOV-05 — Legal Development Hierarchy

- **Record class:** Governance decision
- **Parent capability:** PC-02 — Canonical source and release governance
- **Area / phase / side / type:** Legal governance / V1 onward / internal / release authority
- **Implementation maturity:** Defined or specified
- **Work authorization:** Decision required
- **Purpose:** Distinguish internal product analysis, comparative research, counsel-dependent determinations, reversible internal implementation, deployment clearance, and recurring legal maintenance.
- **Parent user value:** Customers receive the intended verified build and can rely on rollback discipline.
- **Parent strategic role:** Prevents silent source divergence from invalidating payment and trust evidence.
- **Strategic-role tags:** Governance; Security/assurance; Support/operations
- **Current implementation:** The roadmap contains substantive legal boundaries, but the authority/release hierarchy has not been adopted in the operating or attorney-review doctrine.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Requires a concise internal doctrine, counsel-trigger list, deployment gate, and agreement among product behavior, legal pages, procedures, and tests.
- **Entry gate:** The named governing decision is ratified and recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Requires a concise internal doctrine, counsel-trigger list, deployment gate, and agreement among product behavior, legal pages, procedures, and tests.
- **Commercial hypothesis:** Allows reversible research without confusing it with legal clearance.
- **Boundary:** No affected capability may become public, monetized, collect unapproved data, or gain financial authority before its required determination.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap §§11–12 and attorney-review research brief.
- **Next action:** add during the next legal-package session, not by reopening Revision 6.

### GOV-06 — Status and evidence discipline

- **Record class:** Governance decision
- **Parent capability:** PC-02 — Canonical source and release governance
- **Area / phase / side / type:** Governance / all phases / internal / completion control
- **Implementation maturity:** Approved governing record
- **Work authorization:** Ready but not queued
- **Purpose:** Prevent “specified,” “coded,” “tested,” “deployed,” and “customer-validated” from collapsing into one checkbox.
- **Parent user value:** Customers receive the intended verified build and can rely on rollback discipline.
- **Parent strategic role:** Prevents silent source divergence from invalidating payment and trust evidence.
- **Strategic-role tags:** Governance; Security/assurance; Support/operations
- **Current implementation:** Roadmap definition-of-complete and threshold classes exist; older documents still use inconsistent status language.
- **Remaining work:** No active feature work is authorized; preserve and maintain the evidenced behavior unless a later gate opens a change.
- **Dependencies:** Every future roadmap record and release evidence must use the controlled status vocabulary and identify the evidence class.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Every future roadmap record and release evidence must use the controlled status vocabulary and identify the evidence class.
- **Commercial hypothesis:** Protects against false progress and sunk-cost continuation.
- **Boundary:** Downgrade status whenever evidence is missing or contradictory.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** This normalized inventory; `docs/product/product-commercial-roadmap-2026-07-30.md` §§12 and 15.
- **Next action:** apply this vocabulary to this inventory; do not rewrite historical evidence.

### GOV-07 — Deployment evidence and rollback doctrine

- **Record class:** Operational process
- **Parent capability:** PC-02 — Canonical source and release governance
- **Area / phase / side / type:** Production operations / existing / internal / release control
- **Implementation maturity:** Release-evidenced
- **Work authorization:** Ready but not queued
- **Purpose:** Make every production change traceable, reversible, and verifiable on the actual custom domain.
- **Parent user value:** Customers receive the intended verified build and can rely on rollback discipline.
- **Parent strategic role:** Prevents silent source divergence from invalidating payment and trust evidence.
- **Strategic-role tags:** Governance; Security/assurance; Support/operations
- **Current implementation:** Firebase predeploy gates, deploy checklists, production smoke records, rollback procedures, and artifact hash checks exist.
- **Remaining work:** The production branch/commit identity is not yet canonical because of GOV-04.
- **Dependencies:** Clean source state, full required suite, exact target/project, live route and header checks, release record, and rollback path.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Clean source state, full required suite, exact target/project, live route and header checks, release record, and rollback path.
- **Commercial hypothesis:** Reliability and trust infrastructure.
- **Boundary:** Stop any deploy when the source commit, target, authority, or rollback state is ambiguous.
- **Stop rule:** Stop any deploy when the source commit, target, authority, or rollback state is ambiguous.
- **Source / evidence locator:** `firebase.json`; `docs/operations/evidence/gate5-public-launch-2026-06-18.md`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** incorporate canonical-branch identity after GOV-04.

---

# 1. Existing production and transfer foundation

### FND-01 — Polygon USDC transfer contract

- **Record class:** Component
- **Parent capability:** PC-03 — Non-custodial transfer contract and fee controls
- **Area / phase / side / type:** Transfer rail / existing / both / smart contract
- **Implementation maturity:** Production-verified
- **Work authorization:** Deferred
- **Purpose:** Execute a deterministic wallet-to-contract-to-wallet USDC payment without ImplicitEx custody; supplies the proven rail beneath payment operations.
- **Parent user value:** A payer can authorize a deterministic transfer with explicit fee and asset limits.
- **Parent strategic role:** Supplies the proven execution rail beneath the payment-operations product.
- **Strategic-role tags:** Execution; Trust; Security/assurance
- **Current implementation:** Hardened Polygon mainnet contract is deployed, source-verified, Safe-owned, and exercised through controlled live transfer. It remains a reference execution route, not the complete product.
- **Remaining work:** No active feature work is authorized; preserve and maintain the evidenced behavior unless a later gate opens a change.
- **Dependencies:** Verified deployment manifest, contract tests, pause authority, fee and treasury configuration, explorer evidence, and production smoke.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Verified deployment manifest, contract tests, pause authority, fee and treasury configuration, explorer evidence, and production smoke.
- **Commercial hypothesis:** Supports current 1% experiment but does not justify it alone.
- **Boundary:** Never market the contract as custody, recovery, protection, or differentiation by itself.
- **Stop rule:** Never market the contract as custody, recovery, protection, or differentiation by itself.
- **Source / evidence locator:** `app-web/contracts/implicitex_transfer.sol`; `app-web/frontend/public/js/ix-execution.js`; `docs/operations/evidence/gate4-mainnet-controlled-smoke-2026-06-15.md`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** maintenance and security fixes only unless V1 requires a change.

### FND-02 — Deployed 1% fee routing

- **Record class:** Component
- **Parent capability:** PC-03 — Non-custodial transfer contract and fee controls
- **Area / phase / side / type:** Transfer rail / existing / sender / contract policy
- **Implementation maturity:** Production-verified
- **Work authorization:** Deferred
- **Purpose:** Route the configured platform fee while delivering the requested principal to the recipient.
- **Parent user value:** A payer can authorize a deterministic transfer with explicit fee and asset limits.
- **Parent strategic role:** Supplies the proven execution rail beneath the payment-operations product.
- **Strategic-role tags:** Execution; Trust; Security/assurance
- **Current implementation:** Contract charges 100 basis points with no absolute contract cap. Product-market alignment and long-term payer are unproven.
- **Remaining work:** No active feature work is authorized; preserve and maintain the evidenced behavior unless a later gate opens a change.
- **Dependencies:** Exact integer math, allowance for total debit, verified treasury split, customer disclosure, and live policy reconciliation.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Exact integer math, allowance for total debit, verified treasury split, customer disclosure, and live policy reconciliation.
- **Commercial hypothesis:** Pricing hypothesis, not doctrine.
- **Boundary:** Stop defending the fee through invented features if qualified customers bypass it or the value accrues to the recipient instead.
- **Stop rule:** Stop defending the fee through invented features if qualified customers bypass it or the value accrues to the recipient instead.
- **Source / evidence locator:** `app-web/contracts/implicitex_transfer.sol`; `app-web/frontend/public/js/ix-execution.js`; `docs/operations/evidence/gate4-mainnet-controlled-smoke-2026-06-15.md`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** collect separate fee-response evidence during V1/V2; no contract change authorized.

### FND-03 — 250 USDC interface limit

- **Record class:** Component
- **Parent capability:** PC-03 — Non-custodial transfer contract and fee controls
- **Area / phase / side / type:** Transfer risk control / existing / sender / client policy
- **Implementation maturity:** Production-verified
- **Work authorization:** Deferred
- **Purpose:** Bound soft-launch exposure and make the maximum currently reachable fee 2.50 USDC.
- **Parent user value:** A payer can authorize a deterministic transfer with explicit fee and asset limits.
- **Parent strategic role:** Supplies the proven execution rail beneath the payment-operations product.
- **Strategic-role tags:** Execution; Trust; Security/assurance
- **Current implementation:** Portal enforcement and disclosures exist; the contract itself is not limited to 250 USDC.
- **Remaining work:** No active feature work is authorized; preserve and maintain the evidenced behavior unless a later gate opens a change.
- **Dependencies:** Authenticated execution policy, amount validation, client regression tests, and consistent customer copy.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Authenticated execution policy, amount validation, client regression tests, and consistent customer copy.
- **Commercial hypothesis:** This is a risk and launch control, not a market size claim.
- **Boundary:** Do not raise the limit before fee-policy, support, legal, and production evidence gates pass.
- **Stop rule:** Do not raise the limit before fee-policy, support, legal, and production evidence gates pass.
- **Source / evidence locator:** `app-web/contracts/implicitex_transfer.sol`; `app-web/frontend/public/js/ix-execution.js`; `docs/operations/evidence/gate4-mainnet-controlled-smoke-2026-06-15.md`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** none.

### FND-04 — Future 10 USDC absolute fee ceiling

- **Record class:** Component
- **Parent capability:** PC-03 — Non-custodial transfer contract and fee controls
- **Area / phase / side / type:** Pricing/contract policy / later / both / contract change
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Prevent fee growth from becoming disproportionate if supported payment limits exceed 1,000 USDC.
- **Parent user value:** A payer can authorize a deterministic transfer with explicit fee and asset limits.
- **Parent strategic role:** Supplies the proven execution rail beneath the payment-operations product.
- **Strategic-role tags:** Execution; Trust; Security/assurance
- **Current implementation:** Policy and gate are documented; no contract-level ceiling is deployed.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** Customer pricing evidence, revised contract design, audit, deployment, interface/live-policy agreement, and migration plan.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Customer pricing evidence, revised contract design, audit, deployment, interface/live-policy agreement, and migration plan.
- **Commercial hypothesis:** Do not confuse it with current behavior.
- **Boundary:** Do not change the contract before the paying party and pricing mechanism are known.
- **Stop rule:** Do not confuse it with current behavior.
- **Source / evidence locator:** Fee constitution and roadmap §9.
- **Next action:** none.

### FND-05 — Asset and chain allowlist

- **Record class:** Component
- **Parent capability:** PC-03 — Non-custodial transfer contract and fee controls
- **Area / phase / side / type:** Execution configuration / existing / both / route control
- **Implementation maturity:** Production-verified
- **Work authorization:** Deferred
- **Purpose:** Prevent arbitrary-token and wrong-chain execution while keeping each route independently controllable.
- **Parent user value:** A payer can authorize a deterministic transfer with explicit fee and asset limits.
- **Parent strategic role:** Supplies the proven execution rail beneath the payment-operations product.
- **Strategic-role tags:** Execution; Trust; Security/assurance
- **Current implementation:** Polygon USDC is configured and narrow. A generalized delistable asset registry is specified for horizontal expansion but not needed for V1.
- **Remaining work:** No active feature work is authorized; preserve and maintain the evidenced behavior unless a later gate opens a change.
- **Dependencies:** Exact contract addresses, decimals, chain ID, executor, pause status, RPC, and route-specific tests.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Exact contract addresses, decimals, chain ID, executor, pause status, RPC, and route-specific tests.
- **Commercial hypothesis:** Breadth is not value without workflow demand.
- **Boundary:** Never permit a user-supplied token contract.
- **Stop rule:** Never permit a user-supplied token contract.
- **Source / evidence locator:** `app-web/contracts/implicitex_transfer.sol`; `app-web/frontend/public/js/ix-execution.js`; `docs/operations/evidence/gate4-mainnet-controlled-smoke-2026-06-15.md`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** maintain Polygon USDC only.

### FND-06 — Transfer enablement and pause gates

- **Record class:** Component
- **Parent capability:** PC-03 — Non-custodial transfer contract and fee controls
- **Area / phase / side / type:** Execution control / existing / both / release safety
- **Implementation maturity:** Production-verified
- **Work authorization:** Deferred
- **Purpose:** Permit controlled opening, closing, and contract-pause recognition without ambiguous execution state.
- **Parent user value:** A payer can authorize a deterministic transfer with explicit fee and asset limits.
- **Parent strategic role:** Supplies the proven execution rail beneath the payment-operations product.
- **Strategic-role tags:** Execution; Trust; Security/assurance
- **Current implementation:** Global/per-chain enablement, paused-contract checks, controlled smoke, and closure evidence exist.
- **Remaining work:** No active feature work is authorized; preserve and maintain the evidenced behavior unless a later gate opens a change.
- **Dependencies:** Explicit config, onchain pause read, safe UI state, deploy evidence, and no stale cache.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Explicit config, onchain pause read, safe UI state, deploy evidence, and no stale cache.
- **Commercial hypothesis:** Reliability control.
- **Boundary:** A closed gate must never appear executable; an open gate requires explicit release authority.
- **Stop rule:** A closed gate must never appear executable; an open gate requires explicit release authority.
- **Source / evidence locator:** `app-web/contracts/implicitex_transfer.sol`; `app-web/frontend/public/js/ix-execution.js`; `docs/operations/evidence/gate4-mainnet-controlled-smoke-2026-06-15.md`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** maintenance only.

### FND-07 — Injected-wallet connection

- **Record class:** Component
- **Parent capability:** PC-04 — Wallet access and execution continuity
- **Area / phase / side / type:** Wallet access / existing / payer / client integration
- **Implementation maturity:** Production-verified
- **Work authorization:** Deferred
- **Purpose:** Let a user retain key control and use an installed EIP-1193 wallet for authorization.
- **Parent user value:** The payer can use a supported wallet without silent context drift.
- **Parent strategic role:** Keeps wallet authorization as the custody boundary while broadening access.
- **Strategic-role tags:** Execution; Payer usability; Security/assurance
- **Current implementation:** Connection, disconnection, account observation, and mobile MetaMask flows are implemented and smoke-tested.
- **Remaining work:** No active feature work is authorized; preserve and maintain the evidenced behavior unless a later gate opens a change.
- **Dependencies:** Explicit user initiation, provider continuity, account/chain checks, rejection handling, and no passive connection.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Explicit user initiation, provider continuity, account/chain checks, rejection handling, and no passive connection.
- **Commercial hypothesis:** Access feature, not a paid service.
- **Boundary:** Never imply ImplicitEx controls or can recover the wallet.
- **Stop rule:** Never imply ImplicitEx controls or can recover the wallet.
- **Source / evidence locator:** `app-web/frontend/public/js/wallet.js`; `app-web/frontend/public/js/walletconnect-provider.js`; `app-web/tests/frontend/ix-execution-authorized-path.test.js`; `docs/operations/evidence/walletconnect-regression-2026-06-14.md`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** maintenance only.

### FND-08 — WalletConnect/Reown connection

- **Record class:** Component
- **Parent capability:** PC-04 — Wallet access and execution continuity
- **Area / phase / side / type:** Wallet access / existing / payer / client integration
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Broaden mobile and non-injected wallet access while preserving self-custody.
- **Parent user value:** The payer can use a supported wallet without silent context drift.
- **Parent strategic role:** Keeps wallet authorization as the custody boundary while broadening access.
- **Strategic-role tags:** Execution; Payer usability; Security/assurance
- **Current implementation:** Lazy-loaded provider, explicit session teardown, privacy-first refresh behavior, wrong-network handling, and regression tests exist.
- **Remaining work:** Library-side relay noise and broader wallet smoke remain documented caveats.
- **Dependencies:** Project configuration, vendored dependency integrity, provider identity, cancellation, session expiry, and supported-wallet production smoke.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Project configuration, vendored dependency integrity, provider identity, cancellation, session expiry, and supported-wallet production smoke.
- **Commercial hypothesis:** Necessary access parity; not a product thesis.
- **Boundary:** Stop adding wallet vendors when support/test cost exceeds observed abandonment.
- **Stop rule:** Stop adding wallet vendors when support/test cost exceeds observed abandonment.
- **Source / evidence locator:** `app-web/frontend/public/js/wallet.js`; `app-web/frontend/public/js/walletconnect-provider.js`; `app-web/tests/frontend/ix-execution-authorized-path.test.js`; `docs/operations/evidence/walletconnect-regression-2026-06-14.md`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** maintain; add wallet-specific smoke only when demanded.

### FND-09 — Provider continuity

- **Record class:** Component
- **Parent capability:** PC-04 — Wallet access and execution continuity
- **Area / phase / side / type:** Execution security / existing / payer / runtime invariant
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Ensure the provider that supplied authorization context is the provider used for live execution.
- **Parent user value:** The payer can use a supported wallet without silent context drift.
- **Parent strategic role:** Keeps wallet authorization as the custody boundary while broadening access.
- **Strategic-role tags:** Execution; Payer usability; Security/assurance
- **Current implementation:** Provider snapshots, injected/WalletConnect mismatch rejection, session-expiry handling, and one-shot proof consumption are implemented and heavily tested.
- **Remaining work:** Complete the named hardening, canonical integration, and production-evidence conditions before advancing maturity.
- **Dependencies:** Immutable authorization proof, live provider comparison, no automatic fallback, and failure before any state-changing RPC.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Immutable authorization proof, live provider comparison, no automatic fallback, and failure before any state-changing RPC.
- **Commercial hypothesis:** Reduces invisible execution drift.
- **Boundary:** Any bypass or automatic provider substitution is a release blocker.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** `app-web/frontend/public/js/wallet.js`; `app-web/frontend/public/js/walletconnect-provider.js`; `app-web/tests/frontend/ix-execution-authorized-path.test.js`; `docs/operations/evidence/walletconnect-regression-2026-06-14.md`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** preserve through canonical integration.

### FND-10 — Account and chain TOCTOU checks

- **Record class:** Component
- **Parent capability:** PC-04 — Wallet access and execution continuity
- **Area / phase / side / type:** Execution security / existing / payer / runtime invariant
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Stop a payment when wallet account or network changes between review and execution.
- **Parent user value:** The payer can use a supported wallet without silent context drift.
- **Parent strategic role:** Keeps wallet authorization as the custody boundary while broadening access.
- **Strategic-role tags:** Execution; Payer usability; Security/assurance
- **Current implementation:** Account and chain snapshots, live re-reads, explicit drift results, and pre-write blocking tests exist.
- **Remaining work:** Complete the named hardening, canonical integration, and production-evidence conditions before advancing maturity.
- **Dependencies:** Provider continuity, pinned execution plan, one-shot authorization, and no transaction before equality.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Provider continuity, pinned execution plan, one-shot authorization, and no transaction before equality.
- **Commercial hypothesis:** Core trust control.
- **Boundary:** Any drift that can reach `eth_sendTransaction` blocks release.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** `app-web/frontend/public/js/wallet.js`; `app-web/frontend/public/js/walletconnect-provider.js`; `app-web/tests/frontend/ix-execution-authorized-path.test.js`; `docs/operations/evidence/walletconnect-regression-2026-06-14.md`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** preserve through canonical integration.

### FND-11 — Transfer preflight

- **Record class:** Component
- **Parent capability:** PC-05 — Transfer preflight, dispatch, and transaction state
- **Area / phase / side / type:** Payment execution / existing / payer / validation
- **Implementation maturity:** Production-verified
- **Work authorization:** Deferred
- **Purpose:** Detect wrong network, paused route, invalid address, below/above limits, insufficient balance, and required allowance before execution.
- **Parent user value:** The payer knows what will happen and whether retrying is safe.
- **Parent strategic role:** Makes the commodity rail dependable enough to support managed payment workflows.
- **Strategic-role tags:** Execution; Payer usability; Security/assurance; Support/operations
- **Current implementation:** Preview, configured-chain, pause, amount, balance, and refreshed-preflight logic are implemented and tested.
- **Remaining work:** No active feature work is authorized; preserve and maintain the evidenced behavior unless a later gate opens a change.
- **Dependencies:** Authenticated route policy, live chain reads, deterministic amount parsing, and honest unavailable states.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Authenticated route policy, live chain reads, deterministic amount parsing, and honest unavailable states.
- **Commercial hypothesis:** Necessary reliability, not sufficient differentiation.
- **Boundary:** Never describe checks as insurance or a guarantee.
- **Stop rule:** Never describe checks as insurance or a guarantee.
- **Source / evidence locator:** `app-web/frontend/public/js/ix-execution.js`; `app-web/frontend/public/js/transfer-status.js`; `app-web/tests/frontend/ix-execution.test.js`; `docs/testing/transfer-edge-case-rehearsal.md`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** maintenance only.

### FND-12 — Exact amount, fee, and allowance calculation

- **Record class:** Component
- **Parent capability:** PC-05 — Transfer preflight, dispatch, and transaction state
- **Area / phase / side / type:** Payment execution / existing / payer / deterministic calculation
- **Implementation maturity:** Production-verified
- **Work authorization:** Deferred
- **Purpose:** Show and authorize the same principal, fee, and total debit that the contract will execute.
- **Parent user value:** The payer knows what will happen and whether retrying is safe.
- **Parent strategic role:** Makes the commodity rail dependable enough to support managed payment workflows.
- **Strategic-role tags:** Execution; Payer usability; Security/assurance; Support/operations
- **Current implementation:** BigInt/atomic math, 1% basis-point calculation, transfer-only or approve-then-transfer planning, and pinned totals are implemented and live-smoked.
- **Remaining work:** No active feature work is authorized; preserve and maintain the evidenced behavior unless a later gate opens a change.
- **Dependencies:** Token decimals, live allowance, fee policy, exact calldata, and cross-surface parity.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Token decimals, live allowance, fee policy, exact calldata, and cross-surface parity.
- **Commercial hypothesis:** Avoids misleading fee or approval display.
- **Boundary:** Any parallel floating-point or surface-owned fee calculation is prohibited.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** `app-web/frontend/public/js/ix-execution.js`; `app-web/frontend/public/js/transfer-status.js`; `app-web/tests/frontend/ix-execution.test.js`; `docs/testing/transfer-edge-case-rehearsal.md`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** preserve as single authority.

### FND-13 — Approval and transfer dispatch

- **Record class:** Component
- **Parent capability:** PC-05 — Transfer preflight, dispatch, and transaction state
- **Area / phase / side / type:** Payment execution / existing / payer / wallet writes
- **Implementation maturity:** Production-verified
- **Work authorization:** Deferred
- **Purpose:** Execute the exact approved plan through one controlled authority rather than surface-specific wallet calls.
- **Parent user value:** The payer knows what will happen and whether retrying is safe.
- **Parent strategic role:** Makes the commodity rail dependable enough to support managed payment workflows.
- **Strategic-role tags:** Execution; Payer usability; Security/assurance; Support/operations
- **Current implementation:** `IX_EXECUTION` owns approval and `transferWithFee`; rejection and no-retry behavior are tested.
- **Remaining work:** No active feature work is authorized; preserve and maintain the evidenced behavior unless a later gate opens a change.
- **Dependencies:** Authorization proof, provider continuity, TOCTOU checks, pinned calldata, and transaction receipt.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Authorization proof, provider continuity, TOCTOU checks, pinned calldata, and transaction receipt.
- **Commercial hypothesis:** Execution rail only.
- **Boundary:** No new surface may issue fund-moving RPC independently.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** `app-web/frontend/public/js/ix-execution.js`; `app-web/frontend/public/js/transfer-status.js`; `app-web/tests/frontend/ix-execution.test.js`; `docs/testing/transfer-edge-case-rehearsal.md`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** preserve through branch integration.

### FND-14 — Confirmation and finality observation

- **Record class:** Component
- **Parent capability:** PC-05 — Transfer preflight, dispatch, and transaction state
- **Area / phase / side / type:** Settlement observation / existing / both / receipt polling
- **Implementation maturity:** Production-verified
- **Work authorization:** Deferred
- **Purpose:** Distinguish submitted from confirmed and present a defensible final outcome.
- **Parent user value:** The payer knows what will happen and whether retrying is safe.
- **Parent strategic role:** Makes the commodity rail dependable enough to support managed payment workflows.
- **Strategic-role tags:** Execution; Payer usability; Security/assurance; Support/operations
- **Current implementation:** Receipt polling, successful status, explorer links, and finality language exist. V2 still needs a server-side minimal watcher for durable known-submission matching.
- **Remaining work:** No active feature work is authorized; preserve and maintain the evidenced behavior unless a later gate opens a change.
- **Dependencies:** Transaction hash, RPC/provider observation, receipt status, confirmation policy, and chain truth.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Transaction hash, RPC/provider observation, receipt status, confirmation policy, and chain truth.
- **Commercial hypothesis:** Foundation for payment meaning.
- **Boundary:** Never call “submitted” paid or encourage unsafe retry while outcome is unknown.
- **Stop rule:** Never call “submitted” paid or encourage unsafe retry while outcome is unknown.
- **Source / evidence locator:** `app-web/frontend/public/js/ix-execution.js`; `app-web/frontend/public/js/transfer-status.js`; `app-web/tests/frontend/ix-execution.test.js`; `docs/testing/transfer-edge-case-rehearsal.md`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** maintain locally; server watcher remains V2-gated.

### FND-15 — Uncertain-outcome handling

- **Record class:** Component
- **Parent capability:** PC-05 — Transfer preflight, dispatch, and transaction state
- **Area / phase / side / type:** Exception handling / existing / payer / failure-state control
- **Implementation maturity:** Production-verified
- **Work authorization:** Deferred
- **Purpose:** Tell a user when broadcast may have occurred but confirmation is not known, preserving evidence and preventing unsafe retry.
- **Parent user value:** The payer knows what will happen and whether retrying is safe.
- **Parent strategic role:** Makes the commodity rail dependable enough to support managed payment workflows.
- **Strategic-role tags:** Execution; Payer usability; Security/assurance; Support/operations
- **Current implementation:** Interrupted/unknown receipt states, recovery copy, persistence, and explorer guidance are implemented.
- **Remaining work:** Cross-device durable recovery remains outside the current local model.
- **Dependencies:** Broadcast-state distinction, hash preservation when available, non-weakening `fundsMoved`, and explicit retry rules.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Broadcast-state distinction, hash preservation when available, non-weakening `fundsMoved`, and explicit retry rules.
- **Commercial hypothesis:** Operational clarity, not reimbursement.
- **Boundary:** Any failure path that silently returns to “ready” after possible broadcast is a release blocker.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** `app-web/frontend/public/js/ix-execution.js`; `app-web/frontend/public/js/transfer-status.js`; `app-web/tests/frontend/ix-execution.test.js`; `docs/testing/transfer-edge-case-rehearsal.md`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** preserve; extend only through V2 watcher design.

### FND-16 — Local receipt store and rehydration

- **Record class:** Component
- **Parent capability:** PC-06 — Local receipt, proof, and activity foundation
- **Area / phase / side / type:** Evidence / existing / payer / browser persistence
- **Implementation maturity:** Production-verified
- **Work authorization:** Deferred
- **Purpose:** Preserve transaction state, metadata, and outcome across refresh without creating a customer account.
- **Parent user value:** The user can understand and retrieve a payment beyond an explorer hash.
- **Parent strategic role:** Provides the present evidence base that V2 will extend into request-linked operations.
- **Strategic-role tags:** Evidence; Payee operations; Payer usability
- **Current implementation:** LocalStorage receipt lifecycle, active cleanup, history, purpose/reference/memo preservation, and rehydration rules are implemented.
- **Remaining work:** No active feature work is authorized; preserve and maintain the evidenced behavior unless a later gate opens a change.
- **Dependencies:** Schema version, immutable facts, source stamping, terminal-state rules, and storage-failure tolerance.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Schema version, immutable facts, source stamping, terminal-state rules, and storage-failure tolerance.
- **Commercial hypothesis:** Useful foundation but device-bound and not V2 records.
- **Boundary:** Never imply cloud backup or cross-device availability.
- **Stop rule:** Never imply cloud backup or cross-device availability.
- **Source / evidence locator:** `app-web/frontend/public/js/receipt-store.js`; `app-web/frontend/public/js/proof-packet.js`; `app-web/tests/frontend/receipt-transfer-only-lifecycle.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** maintenance; V2 storage waits for Gate 0.

### FND-17 — Local proof packet

- **Record class:** Component
- **Parent capability:** PC-06 — Local receipt, proof, and activity foundation
- **Area / phase / side / type:** Evidence / existing / both / portable artifact
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Turn a receipt and observed chain facts into a downloadable record instead of an isolated transaction hash.
- **Parent user value:** The user can understand and retrieve a payment beyond an explorer hash.
- **Parent strategic role:** Provides the present evidence base that V2 will extend into request-linked operations.
- **Strategic-role tags:** Evidence; Payee operations; Payer usability
- **Current implementation:** Proof packet generation and download exist.
- **Remaining work:** Request binding, route-lineage authority, independent validation, signing-time authentication, and formula-safe export remain incomplete at the product level.
- **Dependencies:** Receipt schema, chain truth, Coin Card authority, fact/inference separation, and refresh/provider tests.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Receipt schema, chain truth, Coin Card authority, fact/inference separation, and refresh/provider tests.
- **Commercial hypothesis:** Candidate evidence value; not enough alone to justify pricing.
- **Boundary:** Stop expanding proof complexity if customers do not use or care about it.
- **Stop rule:** Stop expanding proof complexity if customers do not use or care about it.
- **Source / evidence locator:** `app-web/frontend/public/js/receipt-store.js`; `app-web/frontend/public/js/proof-packet.js`; `app-web/tests/frontend/receipt-transfer-only-lifecycle.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** V1 route-version hardening only.

### FND-18 — Local activity and recipient context

- **Record class:** Component
- **Parent capability:** PC-06 — Local receipt, proof, and activity foundation
- **Area / phase / side / type:** Payment history / existing / payer / browser view
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Let a user revisit recent receipts and recipient context without rescanning the chain.
- **Parent user value:** The user can understand and retrieve a payment beyond an explorer hash.
- **Parent strategic role:** Provides the present evidence base that V2 will extend into request-linked operations.
- **Strategic-role tags:** Evidence; Payee operations; Payer usability
- **Current implementation:** Local receipt history and recipient-context lookup exist. It is not authoritative business history, tenant-isolated cloud storage, or broad wallet history.
- **Remaining work:** Complete the named hardening, canonical integration, and production-evidence conditions before advancing maturity.
- **Dependencies:** Receipt integrity, local privacy, deduplication, and clear device-bound copy.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Receipt integrity, local privacy, deduplication, and clear device-bound copy.
- **Commercial hypothesis:** Foundation for later searchable activity.
- **Boundary:** Do not promote it as V2 matching or accounting.
- **Stop rule:** Do not promote it as V2 matching or accounting.
- **Source / evidence locator:** `app-web/frontend/public/js/receipt-store.js`; `app-web/frontend/public/js/proof-packet.js`; `app-web/tests/frontend/receipt-transfer-only-lifecycle.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** maintenance.

### FND-19 — Modular portal shell and progressive disclosure

- **Record class:** Component
- **Parent capability:** PC-07 — Modular portal, PWA, hosting, and build identity
- **Area / phase / side / type:** Portal / existing / both / interaction architecture
- **Implementation maturity:** Production-verified
- **Work authorization:** Deferred
- **Purpose:** Keep the default payment task legible while allowing deeper network, verification, receipt, and evidence surfaces.
- **Parent user value:** Users see the right tool and status without becoming lost in a crowded dashboard.
- **Parent strategic role:** Creates the expandable portal shell while preserving mobile access and deployment truth.
- **Strategic-role tags:** Distribution/access; Governance; Support/operations
- **Current implementation:** Distinct transfer/network/verification modules, intent-based projection, layout controls, responsive shell, and regression tests exist. The shared V2 object model and full summary/detail/action/evidence workspaces do not.
- **Remaining work:** No active feature work is authorized; preserve and maintain the evidenced behavior unless a later gate opens a change.
- **Dependencies:** One state authority, no hidden payment facts, responsive navigation, and cross-view consistency.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: One state authority, no hidden payment facts, responsive navigation, and cross-view consistency.
- **Commercial hypothesis:** Enables a powerful but simple workspace.
- **Boundary:** Reject panels that expose data without advancing a customer task.
- **Stop rule:** Reject panels that expose data without advancing a customer task.
- **Source / evidence locator:** `app-web/frontend/public/portal-index.html`; `app-web/tests/browser/portal-coordinator-regression.test.js`; `app-web/tests/browser/portal-install-intent.test.js`; `firebase.json`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** maintenance in V1; object work remains V2-gated.

### FND-20 — PWA, install, and responsive mobile surface

- **Record class:** Component
- **Parent capability:** PC-07 — Modular portal, PWA, hosting, and build identity
- **Area / phase / side / type:** Access / existing / both / distribution shell
- **Implementation maturity:** Production-verified
- **Work authorization:** Deferred
- **Purpose:** Make the portal usable and installable on phones without immediately funding native applications.
- **Parent user value:** Users see the right tool and status without becoming lost in a crowded dashboard.
- **Parent strategic role:** Creates the expandable portal shell while preserving mobile access and deployment truth.
- **Strategic-role tags:** Distribution/access; Governance; Support/operations
- **Current implementation:** Manifest, install intent, mobile/iPad layouts, mobile-wallet smoke, and responsive tests exist.
- **Remaining work:** No active feature work is authorized; preserve and maintain the evidenced behavior unless a later gate opens a change.
- **Dependencies:** Secure HTTPS, valid manifest, safe-area behavior, wallet compatibility, and no horizontal overflow.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Secure HTTPS, valid manifest, safe-area behavior, wallet compatibility, and no horizontal overflow.
- **Commercial hypothesis:** PWA-first preserves founder capacity.
- **Boundary:** Native work remains closed unless a platform limitation blocks retained paid users.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** `app-web/frontend/public/portal-index.html`; `app-web/tests/browser/portal-coordinator-regression.test.js`; `app-web/tests/browser/portal-install-intent.test.js`; `firebase.json`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** maintenance only.

### FND-21 — Firebase hosting, security headers, and custom domains

- **Record class:** Component
- **Parent capability:** PC-07 — Modular portal, PWA, hosting, and build identity
- **Area / phase / side / type:** Delivery / existing / both / infrastructure
- **Implementation maturity:** Production-verified
- **Work authorization:** Deferred
- **Purpose:** Serve the main site, portal, and Coin Card surfaces with explicit targets, CSP, cache, framing, and domain rules.
- **Parent user value:** Users see the right tool and status without becoming lost in a crowded dashboard.
- **Parent strategic role:** Creates the expandable portal shell while preserving mobile access and deployment truth.
- **Strategic-role tags:** Distribution/access; Governance; Support/operations
- **Current implementation:** Multi-site Firebase configuration, production target, custom domains, CSP, HSTS, no-cache rules, and deploy smoke exist.
- **Remaining work:** Canonical branch identity remains unresolved under GOV-04.
- **Dependencies:** Correct Firebase project and target, header validation, domain smoke, predeploy gate, and rollback.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Correct Firebase project and target, header validation, domain smoke, predeploy gate, and rollback.
- **Commercial hypothesis:** Foundational reliability.
- **Boundary:** Stop deployment if the target project or source tree is ambiguous.
- **Stop rule:** Stop deployment if the target project or source tree is ambiguous.
- **Source / evidence locator:** `app-web/frontend/public/portal-index.html`; `app-web/tests/browser/portal-coordinator-regression.test.js`; `app-web/tests/browser/portal-install-intent.test.js`; `firebase.json`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** preserve; integrate canonical history.

### FND-22 — Production build identity

- **Record class:** Component
- **Parent capability:** PC-07 — Modular portal, PWA, hosting, and build identity
- **Area / phase / side / type:** Delivery / existing / internal / diagnostics
- **Implementation maturity:** Partially implemented
- **Work authorization:** Ready but not queued
- **Purpose:** Let support and production verification identify the exact build serving a user.
- **Parent user value:** Users see the right tool and status without becoming lost in a crowded dashboard.
- **Parent strategic role:** Creates the expandable portal shell while preserving mobile access and deployment truth.
- **Strategic-role tags:** Distribution/access; Governance; Support/operations
- **Current implementation:** Portal build-info generation and Settings surface exist at `b664563`.
- **Remaining work:** The main-site deployment does not regenerate it and the current live planning deploy therefore carries stale build metadata.
- **Dependencies:** One canonical production branch, build generation for every relevant target, immutable commit/time fields, and live smoke.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: One canonical production branch, build generation for every relevant target, immutable commit/time fields, and live smoke.
- **Commercial hypothesis:** Reduces diagnosis time and deployment ambiguity.
- **Boundary:** Stale identity must never be treated as release proof.
- **Stop rule:** Stale identity must never be treated as release proof.
- **Source / evidence locator:** `app-web/frontend/public/portal-index.html`; `app-web/tests/browser/portal-coordinator-regression.test.js`; `app-web/tests/browser/portal-install-intent.test.js`; `firebase.json`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** resolve during GOV-04 integration.

### FND-23 — Architecture and transaction-flow evidence page

- **Record class:** Component
- **Parent capability:** PC-07 — Modular portal, PWA, hosting, and build identity
- **Area / phase / side / type:** Trust documentation / existing / both / public evidence
- **Implementation maturity:** Production-verified
- **Work authorization:** Deferred
- **Purpose:** Explain architecture, authority, and observed transaction flow to reviewers without substituting claims for evidence.
- **Parent user value:** Users see the right tool and status without becoming lost in a crowded dashboard.
- **Parent strategic role:** Creates the expandable portal shell while preserving mobile access and deployment truth.
- **Strategic-role tags:** Distribution/access; Governance; Support/operations
- **Current implementation:** Generated public page, screenshots, proof packets, predeploy regeneration, and hash-preserving checks exist.
- **Remaining work:** No active feature work is authorized; preserve and maintain the evidenced behavior unless a later gate opens a change.
- **Dependencies:** Canonical source, generated artifact parity, public-safe content, and release gate.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Canonical source, generated artifact parity, public-safe content, and release gate.
- **Commercial hypothesis:** Supports trust and partner review; not a customer workflow.
- **Boundary:** Keep it evidence-based and remove stale implementation claims.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** `app-web/frontend/public/portal-index.html`; `app-web/tests/browser/portal-coordinator-regression.test.js`; `app-web/tests/browser/portal-install-intent.test.js`; `firebase.json`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** maintenance.

---

# 2. Shared product-object and portal model

### OBJ-01 — Stable object identity and history

- **Record class:** Component
- **Parent capability:** PC-08 — Shared payment-object and portal model
- **Area / phase / side / type:** Product architecture / V1→V2 / both / shared model
- **Implementation maturity:** Defined or specified
- **Work authorization:** Decision required
- **Purpose:** Give every profile, contact, card, request, transfer, receipt, template, schedule, and exception a stable ID, state machine, authority source, and history.
- **Parent user value:** The same payment remains understandable across summary, detail, action, and evidence views.
- **Parent strategic role:** Prevents the suite from becoming disconnected applications or contradictory records.
- **Strategic-role tags:** Governance; Payee operations; Evidence
- **Current implementation:** Several existing objects have local or Coin Card IDs, but there is no ratified product-wide identity/relationship model.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** Signed-record ratification, V2 tenant model, public/private data separation, and explicit mutation rules.
- **Entry gate:** The named governing decision is ratified and recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Signed-record ratification, V2 tenant model, public/private data separation, and explicit mutation rules.
- **Commercial hypothesis:** Prevents the suite from becoming disconnected tools.
- **Boundary:** Do not introduce a second authoritative status for the same payment.
- **Stop rule:** Do not introduce a second authoritative status for the same payment.
- **Source / evidence locator:** Roadmap portal doctrine.
- **Next action:** define only the V1 relationships needed for credential/evidence; full model waits for V2 Gate 0.

### OBJ-02 — Business profile

- **Record class:** Component
- **Parent capability:** PC-08 — Shared payment-object and portal model
- **Area / phase / side / type:** Workspace / V2 / payee / customer object
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Hold operator presentation, preferences, approved claims, and billing context without confusing the profile with legal identity.
- **Parent user value:** The same payment remains understandable across summary, detail, action, and evidence views.
- **Parent strategic role:** Prevents the suite from becoming disconnected applications or contradictory records.
- **Strategic-role tags:** Governance; Payee operations; Evidence
- **Current implementation:** Coin Card presentation fields exist.
- **Remaining work:** Authenticated profile, private preferences, billing relationship, and claim history do not.
- **Dependencies:** V1 demand, V2 Gate 0, authoritative field ownership, retention, and claim definitions.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V1 demand, V2 Gate 0, authoritative field ownership, retention, and claim definitions.
- **Commercial hypothesis:** Supports recipient-paid workspace tiers.
- **Boundary:** No unsupported “identity verified” language.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Product definition and portal doctrine.
- **Next action:** none before V2 Gate 0.

### OBJ-03 — Contact or recipient record

- **Record class:** Component
- **Parent capability:** PC-08 — Shared payment-object and portal model
- **Area / phase / side / type:** Workspace / V2 Expansion / both / counterparty object
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Preserve useful counterparty context without searching messages or implying verified identity.
- **Parent user value:** The same payment remains understandable across summary, detail, action, and evidence views.
- **Parent strategic role:** Prevents the suite from becoming disconnected applications or contradictory records.
- **Strategic-role tags:** Governance; Payee operations; Evidence
- **Current implementation:** Local recipient context exists.
- **Remaining work:** Tenant-scoped contacts, provenance, update history, and privacy controls do not.
- **Dependencies:** V2 Core use, Gate 0, three customers naming the problem, and one active expansion slot.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2 Core use, Gate 0, three customers naming the problem, and one active expansion slot.
- **Commercial hypothesis:** Retention/convenience value.
- **Boundary:** Stop if users rely on wallet/ENS contacts and do not revisit ImplicitEx records.
- **Stop rule:** Stop if users rely on wallet/ENS contacts and do not revisit ImplicitEx records.
- **Source / evidence locator:** Capability register.
- **Next action:** none.

### OBJ-04 — Coin Card object

- **Record class:** Component
- **Parent capability:** PC-08 — Shared payment-object and portal model
- **Area / phase / side / type:** Payment identity / V1 / payee / public/private object
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Provide the persistent payment identity that requests, route history, and evidence can reference.
- **Parent user value:** The same payment remains understandable across summary, detail, action, and evidence views.
- **Parent strategic role:** Prevents the suite from becoming disconnected applications or contradictory records.
- **Strategic-role tags:** Governance; Payee operations; Evidence
- **Current implementation:** Card IDs, manifests, lifecycle records, presentation, and active demo cards exist.
- **Remaining work:** Controlled customer issuance and ratified public/private administration do not.
- **Dependencies:** Complete Coin Card trust stack, namespace policy, wallet challenge, lifecycle operations, and Gate 1A.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Complete Coin Card trust stack, namespace policy, wallet challenge, lifecycle operations, and Gate 1A.
- **Commercial hypothesis:** Seed object for the workspace.
- **Boundary:** Stop treating it as a standalone business if users value only appearance or generic links.
- **Stop rule:** Stop treating it as a standalone business if users value only appearance or generic links.
- **Source / evidence locator:** `app-web/frontend/public/portal-index.html`; `app-web/tests/frontend/portal-surface-registry.test.js`; `app-web/tests/frontend/portal-view-projection.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** V1 trust ratification and issuance gate.

### OBJ-05 — Payment request object

- **Record class:** Component
- **Parent capability:** PC-08 — Shared payment-object and portal model
- **Area / phase / side / type:** Payment operations / V2 Core / payee / signed object
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Freeze amount, purpose, reference, destination, asset, chain, issue time, and expiry into one request.
- **Parent user value:** The same payment remains understandable across summary, detail, action, and evidence views.
- **Parent strategic role:** Prevents the suite from becoming disconnected applications or contradictory records.
- **Strategic-role tags:** Governance; Payee operations; Evidence
- **Current implementation:** Receipt metadata and Coin Card intent concepts exist; no V2 request record family or lifecycle is implemented.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** V1 signed-record ratification, V2 Gate 0, canonical amounts, request ID, lifecycle, and URL safety.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V1 signed-record ratification, V2 Gate 0, canonical amounts, request ID, lifecycle, and URL safety.
- **Commercial hypothesis:** Candidate anchor for paid small-operator workflow.
- **Boundary:** Stop if Request/free invoicing already satisfies the target user.
- **Stop rule:** Stop if Request/free invoicing already satisfies the target user.
- **Source / evidence locator:** Roadmap V2 and capability register.
- **Next action:** none until V1 exit and Gate 0.

### OBJ-06 — Transfer object

- **Record class:** Component
- **Parent capability:** PC-08 — Shared payment-object and portal model
- **Area / phase / side / type:** Payment operations / existing→V2 / both / execution object
- **Implementation maturity:** Partially implemented
- **Work authorization:** Ready but not queued
- **Purpose:** Preserve authorization and chain execution state separately from the business request it may satisfy.
- **Parent user value:** The same payment remains understandable across summary, detail, action, and evidence views.
- **Parent strategic role:** Prevents the suite from becoming disconnected applications or contradictory records.
- **Strategic-role tags:** Governance; Payee operations; Evidence
- **Current implementation:** Local receipts contain execution state and evidence.
- **Remaining work:** Durable tenant-scoped transfer objects and request relationships do not.
- **Dependencies:** V2 Gate 0, transaction-hash capture, watcher, idempotency, and chain-truth precedence.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2 Gate 0, transaction-hash capture, watcher, idempotency, and chain-truth precedence.
- **Commercial hypothesis:** Connects commodity execution to payment meaning.
- **Boundary:** Never infer request authority from amount and address alone.
- **Stop rule:** Never infer request authority from amount and address alone.
- **Source / evidence locator:** `app-web/frontend/public/portal-index.html`; `app-web/tests/frontend/portal-surface-registry.test.js`; `app-web/tests/frontend/portal-view-projection.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** maintain local state; durable model waits for V2.

### OBJ-07 — Receipt or evidence object

- **Record class:** Component
- **Parent capability:** PC-08 — Shared payment-object and portal model
- **Area / phase / side / type:** Evidence / V1→V2 / both / portable record
- **Implementation maturity:** Partially implemented
- **Work authorization:** Ready but not queued
- **Purpose:** Join request, route authority, authorization context, execution, and settlement into an independently inspectable payment record.
- **Parent user value:** The same payment remains understandable across summary, detail, action, and evidence views.
- **Parent strategic role:** Prevents the suite from becoming disconnected applications or contradictory records.
- **Strategic-role tags:** Governance; Payee operations; Evidence
- **Current implementation:** Local receipt, proof packet, and sealed Transaction Evidence contracts exist.
- **Remaining work:** Complete request binding and production v2 evidence authentication do not.
- **Dependencies:** Coin Card authority, transaction evidence runtime, V2 request family, watcher, and export policy.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Coin Card authority, transaction evidence runtime, V2 request family, watcher, and export policy.
- **Commercial hypothesis:** Supports records, disputes, matching, and bookkeeper use.
- **Boundary:** Stop deep cryptographic expansion if customers do not use the artifact or its distinction.
- **Stop rule:** Stop deep cryptographic expansion if customers do not use the artifact or its distinction.
- **Source / evidence locator:** `app-web/frontend/public/portal-index.html`; `app-web/tests/frontend/portal-surface-registry.test.js`; `app-web/tests/frontend/portal-view-projection.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** V1 route-version preservation.

### OBJ-08 — Template or schedule object

- **Record class:** Component
- **Parent capability:** PC-08 — Shared payment-object and portal model
- **Area / phase / side / type:** Payment preparation / V2 Expansion→V3 / payer / reusable instruction
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Remember repeat instructions and timing while preserving fresh wallet authorization.
- **Parent user value:** The same payment remains understandable across summary, detail, action, and evidence views.
- **Parent strategic role:** Prevents the suite from becoming disconnected applications or contradictory records.
- **Strategic-role tags:** Governance; Payee operations; Evidence
- **Current implementation:** No authenticated template/schedule object exists.
- **Remaining work:** Repeat metadata can only be reconstructed from local history.
- **Dependencies:** V2 Core repeated use, Gate 0, cancellation, route revalidation, timezone rules, and duplicate prevention.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2 Core repeated use, Gate 0, cancellation, route revalidation, timezone rules, and duplicate prevention.
- **Commercial hypothesis:** Retention hypothesis.
- **Boundary:** It must never become an automatic pull under the current authority model.
- **Stop rule:** It must never become an automatic pull under the current authority model.
- **Source / evidence locator:** Capability register and scheduled authority table.
- **Next action:** none.

### OBJ-09 — Exception object

- **Record class:** Component
- **Parent capability:** PC-08 — Shared payment-object and portal model
- **Area / phase / side / type:** Payment operations / V2 Core→ Expansion / payee / review object
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Represent unmatched, failed, expired, cancelled, uncertain, and later partial/excessive/duplicate-suspect states as operator work rather than raw transaction anomalies.
- **Parent user value:** The same payment remains understandable across summary, detail, action, and evidence views.
- **Parent strategic role:** Prevents the suite from becoming disconnected applications or contradictory records.
- **Strategic-role tags:** Governance; Payee operations; Evidence
- **Current implementation:** Local execution errors exist.
- **Remaining work:** Tenant-scoped exception records, correction history, assignment, and evidence links do not.
- **Dependencies:** V2 Gate 0, deterministic matching, status taxonomy, idempotency, and operator authorization.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2 Gate 0, deterministic matching, status taxonomy, idempotency, and operator authorization.
- **Commercial hypothesis:** Core administrative value only if users revisit and resolve the queue.
- **Boundary:** Stop if it becomes a passive dashboard.
- **Stop rule:** Stop if it becomes a passive dashboard.
- **Source / evidence locator:** V2 matching architecture and capability register.
- **Next action:** exact V2 Core exceptions only after Gate 0.

### OBJ-10 — Summary, detail, action, and evidence projections

- **Record class:** Component
- **Parent capability:** PC-08 — Shared payment-object and portal model
- **Area / phase / side / type:** Portal architecture / V2 / both / view system
- **Implementation maturity:** Partially implemented
- **Work authorization:** Ready but not queued
- **Purpose:** Let the same authoritative object stay simple by default and expand into the depth needed for review or action.
- **Parent user value:** The same payment remains understandable across summary, detail, action, and evidence views.
- **Parent strategic role:** Prevents the suite from becoming disconnected applications or contradictory records.
- **Strategic-role tags:** Governance; Payee operations; Evidence
- **Current implementation:** Portal projection/visibility contracts and multiple transfer surfaces exist.
- **Remaining work:** Product-object projections are not yet defined.
- **Dependencies:** OBJ-01, authoritative state, responsive behavior, and no hidden security-critical facts.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: OBJ-01, authoritative state, responsive behavior, and no hidden security-critical facts.
- **Commercial hypothesis:** Enables the “organized beast” without overwhelming users.
- **Boundary:** Reject any view that creates a competing status source.
- **Stop rule:** Reject any view that creates a competing status source.
- **Source / evidence locator:** `app-web/frontend/public/portal-index.html`; `app-web/tests/frontend/portal-surface-registry.test.js`; `app-web/tests/frontend/portal-view-projection.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** preserve existing shell; define new projections only with V2 tasks.

### OBJ-11 — Saved views, filters, columns, and curated layouts

- **Record class:** Component
- **Parent capability:** PC-08 — Shared payment-object and portal model
- **Area / phase / side / type:** Portal customization / V2 Expansion / payee / preference system
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Adapt the workspace to an operator's task without arbitrary presentation code.
- **Parent user value:** The same payment remains understandable across summary, detail, action, and evidence views.
- **Parent strategic role:** Prevents the suite from becoming disconnected applications or contradictory records.
- **Strategic-role tags:** Governance; Payee operations; Evidence
- **Current implementation:** A local columns/stacked portal layout exists.
- **Remaining work:** Tenant-scoped saved views, filters, and columns do not.
- **Dependencies:** Gate 0, stable object schema, repeated use, one expansion slot, and cross-view status parity.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Gate 0, stable object schema, repeated use, one expansion slot, and cross-view status parity.
- **Commercial hypothesis:** Potential retention value.
- **Boundary:** No arbitrary CSS, executable customization, or ability to hide payment facts.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap customization boundary.
- **Next action:** none.

---

# 3. Coin Card trust, integrity, lifecycle, and execution stack

### CC-01 — Durable Coin Card ID

- **Record class:** Component
- **Parent capability:** PC-09 — Coin Card identity, manifest, and key authority
- **Area / phase / side / type:** Payment identity / V1 / payee / identifier
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Deferred
- **Purpose:** Keep a card's cryptographic and historical identity stable even when a human-readable route changes.
- **Parent user value:** A payer can verify which signed payment credential was actually published.
- **Parent strategic role:** Turns a public destination into a cryptographically bounded payment credential.
- **Strategic-role tags:** Trust; Evidence; Security/assurance
- **Current implementation:** Durable IDs exist in registry paths, manifests, and active demo cards.
- **Remaining work:** Customer issuance governance remains gated.
- **Dependencies:** Unique immutable ID, registry/manifest equality, collision tests, and preservation through alias changes.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Unique immutable ID, registry/manifest equality, collision tests, and preservation through alias changes.
- **Commercial hypothesis:** Trust foundation, not a paid feature by itself.
- **Boundary:** Never make a handle the sole durable identity.
- **Stop rule:** Never make a handle the sole durable identity.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_MANIFEST_SCHEMA_V1.md`; `docs/product/coin-card/COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md`; `app-web/tests/frontend/coin-card-signing-generator.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** preserve during V1 issuance.

### CC-02 — Revocable handle and canonical route

- **Record class:** Component
- **Parent capability:** PC-09 — Coin Card identity, manifest, and key authority
- **Area / phase / side / type:** Payment identity / V1 / payee / routing alias
- **Implementation maturity:** Partially implemented
- **Work authorization:** Ready but not queued
- **Purpose:** Give a recipient a shareable route that can be suspended, renamed, redirected, or revoked without erasing history.
- **Parent user value:** A payer can verify which signed payment credential was actually published.
- **Parent strategic role:** Turns a public destination into a cryptographically bounded payment credential.
- **Strategic-role tags:** Trust; Evidence; Security/assurance
- **Current implementation:** `/card/<id-or-handle>` routing and active cards exist; canonical public handle policy, rename/redirect behavior, and customer operations are not ratified.
- **Remaining work:** Complete the unresolved end-to-end implementation and evidence conditions stated in this record.
- **Dependencies:** CC-01, namespace policy, registry state, complaint handling, and historical evidence.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: CC-01, namespace policy, registry state, complaint handling, and historical evidence.
- **Commercial hypothesis:** Supports persistent identity.
- **Boundary:** Do not claim a handle is property, identity proof, or trademark ownership.
- **Stop rule:** Do not claim a handle is property, identity proof, or trademark ownership.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_MANIFEST_SCHEMA_V1.md`; `docs/product/coin-card/COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md`; `app-web/tests/frontend/coin-card-signing-generator.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** lock V1 URL/alias rules.

### CC-03 — Namespace governance

- **Record class:** Component
- **Parent capability:** PC-09 — Coin Card identity, manifest, and key authority
- **Area / phase / side / type:** Payment identity / V1 / payee / governance policy
- **Implementation maturity:** Defined or specified
- **Work authorization:** Ready but not queued
- **Purpose:** Prevent phishing, platform confusion, impersonation, and unsupportable username disputes.
- **Parent user value:** A payer can verify which signed payment credential was actually published.
- **Parent strategic role:** Turns a public destination into a cryptographically bounded payment credential.
- **Strategic-role tags:** Trust; Evidence; Security/assurance
- **Current implementation:** Reserved-name categories and revocable-alias doctrine are defined in the roadmap.
- **Remaining work:** Actual policy, initial reserve set, evidence process, and operator runbook remain.
- **Dependencies:** Trademark/impersonation terms, status model, complaint route, admin authority, and audit history.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Trademark/impersonation terms, status model, complaint route, admin authority, and audit history.
- **Commercial hypothesis:** Enables controlled public identity without building global trademark adjudication.
- **Boundary:** Begin with a small high-risk reserve set and reactive enforcement.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap §6 namespace policy.
- **Next action:** ratify before first external embed.

### CC-04 — Wallet-control challenge

- **Record class:** Component
- **Parent capability:** PC-09 — Coin Card identity, manifest, and key authority
- **Area / phase / side / type:** Payment identity / V1 / payee / control evidence
- **Implementation maturity:** Defined or specified
- **Work authorization:** Ready but not queued
- **Purpose:** Establish that the applicant controlled the wallet assigned to the issued payment route at a recorded time.
- **Parent user value:** A payer can verify which signed payment credential was actually published.
- **Parent strategic role:** Turns a public destination into a cryptographically bounded payment credential.
- **Strategic-role tags:** Trust; Evidence; Security/assurance
- **Current implementation:** A wallet-ownership proof boundary exists in staging; Gate 1A explicitly prohibits treating it as a production issuance path.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** Gate 1A closure, challenge nonce, domain binding, expiry, replay prevention, verification record, and production smoke.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Gate 1A closure, challenge nonce, domain binding, expiry, replay prevention, verification record, and production smoke.
- **Commercial hypothesis:** Supports the narrow claim `WALLET CONTROL CONFIRMED`; never claim legal identity or ongoing control forever.
- **Boundary:** The record remains within the governing self-custody, data, security, and scope boundaries.
- **Stop rule:** Supports the narrow claim `WALLET CONTROL CONFIRMED`; never claim legal identity or ongoing control forever.
- **Source / evidence locator:** wallet proof runtime, V1 roadmap, Gate 1A evidence.
- **Next action:** resolve Gate 1A before genuine issuance.

### CC-05 — Coin Card manifest schema

- **Record class:** Component
- **Parent capability:** PC-09 — Coin Card identity, manifest, and key authority
- **Area / phase / side / type:** Trust architecture / V1 / both / signed data contract
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Define the exact card, route, asset, chain, amount policy, validity, protected assets, and key metadata entering verification.
- **Parent user value:** A payer can verify which signed payment credential was actually published.
- **Parent strategic role:** Turns a public destination into a cryptographically bounded payment credential.
- **Strategic-role tags:** Trust; Evidence; Security/assurance
- **Current implementation:** Normative schema, fixtures, manifest JSON, proof tooling, and runtime verification exist.
- **Remaining work:** V1 claim/field ratification and canonical branch reconciliation remain.
- **Dependencies:** Closed schema, canonical serialization, atomic values, environment/domain fields, mutation tests, and signed production artifacts.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Closed schema, canonical serialization, atomic values, environment/domain fields, mutation tests, and signed production artifacts.
- **Commercial hypothesis:** Foundation for independently inspectable payment identity.
- **Boundary:** Do not add fields simply because data is available.
- **Stop rule:** Do not add fields simply because data is available.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_MANIFEST_SCHEMA_V1.md`; `docs/product/coin-card/COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md`; `app-web/tests/frontend/coin-card-signing-generator.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** V1 signed-record ratification.

### CC-06 — Canonical serialization

- **Record class:** Component
- **Parent capability:** PC-09 — Coin Card identity, manifest, and key authority
- **Area / phase / side / type:** Trust architecture / V1 / both / cryptographic primitive
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Ensure every signer and verifier derives identical bytes from the same record.
- **Parent user value:** A payer can verify which signed payment credential was actually published.
- **Parent strategic role:** Turns a public destination into a cryptographically bounded payment credential.
- **Strategic-role tags:** Trust; Evidence; Security/assurance
- **Current implementation:** Canonical JSON contracts, deterministic fixtures, generator tests, and signed artifacts exist.
- **Remaining work:** Product-wide reuse policy and V1 ratification remain.
- **Dependencies:** Closed input types, duplicate/cyclic/shared-reference rejection, Unicode/number rules, and cross-runtime vectors.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Closed input types, duplicate/cyclic/shared-reference rejection, Unicode/number rules, and cross-runtime vectors.
- **Commercial hypothesis:** Invisible trust infrastructure.
- **Boundary:** Never invent a second ad hoc canonicalization for payment requests.
- **Stop rule:** Never invent a second ad hoc canonicalization for payment requests.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_MANIFEST_SCHEMA_V1.md`; `docs/product/coin-card/COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md`; `app-web/tests/frontend/coin-card-signing-generator.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** ratify as the first ImplicitEx-wide signed-record primitive.

### CC-07 — Verification-domain and record-type separation

- **Record class:** Component
- **Parent capability:** PC-09 — Coin Card identity, manifest, and key authority
- **Area / phase / side / type:** Trust architecture / V1 / both / cryptographic policy
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Prevent a valid signature for one environment, record family, or authority from being replayed as another.
- **Parent user value:** A payer can verify which signed payment credential was actually published.
- **Parent strategic role:** Turns a public destination into a cryptographically bounded payment credential.
- **Strategic-role tags:** Trust; Evidence; Security/assurance
- **Current implementation:** Signature/envelope contracts bind schema, usage, environment, and key policy.
- **Remaining work:** A product-wide signed-record constitution has not yet ratified all future families.
- **Dependencies:** Explicit domain, record type, version, environment, intended verifier, and negative cross-family tests.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Explicit domain, record type, version, environment, intended verifier, and negative cross-family tests.
- **Commercial hypothesis:** Enables future requests without weakening Coin Card authority.
- **Boundary:** Unknown domains and schemas fail closed.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_MANIFEST_SCHEMA_V1.md`; `docs/product/coin-card/COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md`; `app-web/tests/frontend/coin-card-signing-generator.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** include in V1 ratification decision.

### CC-08 — Manifest signing

- **Record class:** Component
- **Parent capability:** PC-09 — Coin Card identity, manifest, and key authority
- **Area / phase / side / type:** Trust architecture / V1 / both / issuance control
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Authenticate the immutable record ImplicitEx issued rather than trusting mutable presentation data.
- **Parent user value:** A payer can verify which signed payment credential was actually published.
- **Parent strategic role:** Turns a public destination into a cryptographically bounded payment credential.
- **Strategic-role tags:** Trust; Evidence; Security/assurance
- **Current implementation:** Ed25519/JWS signing generator, abstract signer interface, signed production artifacts, and tests exist.
- **Remaining work:** Customer issuance, production signer operations, and compromise runbook remain gated.
- **Dependencies:** Canonical bytes, authorized key, protected signing environment, issuance audit, independent verification, and key-rotation procedure.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Canonical bytes, authorized key, protected signing environment, issuance audit, independent verification, and key-rotation procedure.
- **Commercial hypothesis:** Supports verifiable route claims.
- **Boundary:** Never expose private signing material to the browser or repository.
- **Stop rule:** Never expose private signing material to the browser or repository.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_MANIFEST_SCHEMA_V1.md`; `docs/product/coin-card/COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md`; `app-web/tests/frontend/coin-card-signing-generator.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** ratify signer operating procedure.

### CC-09 — Trusted public-key source

- **Record class:** Component
- **Parent capability:** PC-09 — Coin Card identity, manifest, and key authority
- **Area / phase / side / type:** Trust architecture / V1 / both / key authority
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Let verifiers discover which public key and usage were authorized for an issuance period.
- **Parent user value:** A payer can verify which signed payment credential was actually published.
- **Parent strategic role:** Turns a public destination into a cryptographically bounded payment credential.
- **Strategic-role tags:** Trust; Evidence; Security/assurance
- **Current implementation:** Protected trusted-key source, resolver, usage rules, and browser tests exist.
- **Remaining work:** Canonical integration and customer-issuance operating evidence remain.
- **Dependencies:** Immutable key ID, allowed usages, activation/retirement time, integrity protection, and fail-closed lookup.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Immutable key ID, allowed usages, activation/retirement time, integrity protection, and fail-closed lookup.
- **Commercial hypothesis:** Required for independent verification.
- **Boundary:** Never silently replace key material beneath an existing key ID.
- **Stop rule:** Never silently replace key material beneath an existing key ID.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_TRUSTED_KEY_SOURCE_CONTRACT_V1.md`; `app-web/tests/frontend/coin-card-trusted-key-resolution.test.js`; `app-web/tests/frontend/coin-card-lifecycle-bundle-verification.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** V1 ratification and operating runbook.

### CC-10 — Signing-key rotation and retirement

- **Record class:** Component
- **Parent capability:** PC-09 — Coin Card identity, manifest, and key authority
- **Area / phase / side / type:** Trust operations / V1 / both / lifecycle control
- **Implementation maturity:** Partially implemented
- **Work authorization:** Ready but not queued
- **Purpose:** Rotate active keys without invalidating legitimate historical records and respond to compromise.
- **Parent user value:** A payer can verify which signed payment credential was actually published.
- **Parent strategic role:** Turns a public destination into a cryptographically bounded payment credential.
- **Strategic-role tags:** Trust; Evidence; Security/assurance
- **Current implementation:** Rotation infrastructure and trusted-key temporal schemas exist across divergent branches; routine rotation, emergency revocation, historical verification, and live drill are not demonstrated in one canonical production tree.
- **Remaining work:** Complete the unresolved end-to-end implementation and evidence conditions stated in this record.
- **Dependencies:** GOV-04, protected root of trust, activation/retirement policy, compromise classification, reissuance rules, and rehearsal.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: GOV-04, protected root of trust, activation/retirement policy, compromise classification, reissuance rules, and rehearsal.
- **Commercial hypothesis:** Business-continuity trust control.
- **Boundary:** No customer issuance before a workable compromise path exists.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_TRUSTED_KEY_SOURCE_CONTRACT_V1.md`; `app-web/tests/frontend/coin-card-trusted-key-resolution.test.js`; `app-web/tests/frontend/coin-card-lifecycle-bundle-verification.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** reconcile during canonical integration, then rehearse in V1.

### CC-11 — Signed registry record

- **Record class:** Component
- **Parent capability:** PC-09 — Coin Card identity, manifest, and key authority
- **Area / phase / side / type:** Trust architecture / V1 / both / current-state publication
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Publish authenticated current route and execution facts separately from mutable visual presentation.
- **Parent user value:** A payer can verify which signed payment credential was actually published.
- **Parent strategic role:** Turns a public destination into a cryptographically bounded payment credential.
- **Strategic-role tags:** Trust; Evidence; Security/assurance
- **Current implementation:** Registry schemas, signed lifecycle/registry publication fixtures, active card records, and executable-record validation exist.
- **Remaining work:** Controlled customer publication and private admin authority remain.
- **Dependencies:** Manifest/registry identity, publication key, atomic bundle, rollback rules, and production operations.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Manifest/registry identity, publication key, atomic bundle, rollback rules, and production operations.
- **Commercial hypothesis:** Supplies current authority.
- **Boundary:** A registry record may not create facts absent from the signed source.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_TRUSTED_KEY_SOURCE_CONTRACT_V1.md`; `app-web/tests/frontend/coin-card-trusted-key-resolution.test.js`; `app-web/tests/frontend/coin-card-lifecycle-bundle-verification.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** V1 ratification and issuance rehearsal.

### CC-12 — Registry bundle authentication and atomicity

- **Record class:** Component
- **Parent capability:** PC-09 — Coin Card identity, manifest, and key authority
- **Area / phase / side / type:** Trust architecture / V1 / both / collection verification
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Prevent one malformed, unauthenticated, or incoherent entry from being selectively ignored inside lifecycle state.
- **Parent user value:** A payer can verify which signed payment credential was actually published.
- **Parent strategic role:** Turns a public destination into a cryptographically bounded payment credential.
- **Strategic-role tags:** Trust; Evidence; Security/assurance
- **Current implementation:** Atomic bundle verification, hostile-input tests, and private proof predicates exist.
- **Remaining work:** Complete the named hardening, canonical integration, and production-evidence conditions before advancing maturity.
- **Dependencies:** Trusted keys, record authentication, wrapper invariants, coherent ordering, and one verification instant.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Trusted keys, record authentication, wrapper invariants, coherent ordering, and one verification instant.
- **Commercial hypothesis:** Fail-closed foundation.
- **Boundary:** Any partial-success behavior is prohibited.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_TRUSTED_KEY_SOURCE_CONTRACT_V1.md`; `app-web/tests/frontend/coin-card-trusted-key-resolution.test.js`; `app-web/tests/frontend/coin-card-lifecycle-bundle-verification.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** preserve through integration and V1 smoke.

### CC-13 — Lifecycle administration and publication authority

- **Record class:** Control
- **Parent capability:** PC-10 — Coin Card lifecycle and route authority
- **Area / phase / side / type:** Trust governance / V1 / both / administrative authority
- **Implementation maturity:** Defined or specified
- **Work authorization:** Decision required
- **Purpose:** Define who may issue, suspend, revoke, supersede, replace, and publish card lifecycle facts.
- **Parent user value:** A payer can tell whether the route is presently authorized and how it changed.
- **Parent strategic role:** Adds route lineage and revocation evidence beyond a simple mutable name.
- **Strategic-role tags:** Trust; Evidence; Security/assurance
- **Current implementation:** Normative authority contracts exist; production roles, least privilege, evidence retention, and operator procedures are not ratified for the pilot.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** Admin role separation, authenticated publication, audit record, incident authority, and runbooks.
- **Entry gate:** The named governing decision is ratified and recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Admin role separation, authenticated publication, audit record, incident authority, and runbooks.
- **Commercial hypothesis:** Makes revocation operational rather than a marketing claim.
- **Boundary:** No undocumented administrative override.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Lifecycle Registry Authority contract.
- **Next action:** lock V1 authority before controlled issuance.

### CC-14 — Lifecycle record authentication

- **Record class:** Control
- **Parent capability:** PC-10 — Coin Card lifecycle and route authority
- **Area / phase / side / type:** Trust architecture / V1 / both / signed-state validation
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Prove that lifecycle state came from authorized publication and was not altered.
- **Parent user value:** A payer can tell whether the route is presently authorized and how it changed.
- **Parent strategic role:** Adds route lineage and revocation evidence beyond a simple mutable name.
- **Strategic-role tags:** Trust; Evidence; Security/assurance
- **Current implementation:** Canonical lifecycle record verification, semantics, negative tests, and signed bundle fixtures exist.
- **Remaining work:** Complete the named hardening, canonical integration, and production-evidence conditions before advancing maturity.
- **Dependencies:** Trusted key usage, canonical administration evidence, temporal fields, and signature encoding.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Trusted key usage, canonical administration evidence, temporal fields, and signature encoding.
- **Commercial hypothesis:** Required for credible currentness.
- **Boundary:** Invalid or unavailable authentication blocks presentation/execution as specified.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_LIFECYCLE_REGISTRY_CONTRACT_V1.md`; `app-web/tests/frontend/coin-card-lifecycle-resolution.test.js`; `app-web/tests/frontend/coin-card-lifecycle-presentation.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** V1 production-path confirmation.

### CC-15 — Lifecycle selection and lineage coherence

- **Record class:** Control
- **Parent capability:** PC-10 — Coin Card lifecycle and route authority
- **Area / phase / side / type:** Trust architecture / V1 / both / evidence selection
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Select the coherent record lineage for a card/manifest without trusting caller-supplied ordering or a fabricated proof.
- **Parent user value:** A payer can tell whether the route is presently authorized and how it changed.
- **Parent strategic role:** Adds route lineage and revocation evidence beyond a simple mutable name.
- **Strategic-role tags:** Trust; Evidence; Security/assurance
- **Current implementation:** Record selection, duplicate/conflict/gap checks, manifest-specific history, and private proof predicates are implemented.
- **Remaining work:** Complete the named hardening, canonical integration, and production-evidence conditions before advancing maturity.
- **Dependencies:** Authenticated bundle, stable positions, lineage links, and structural-conflict rejection.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Authenticated bundle, stable positions, lineage links, and structural-conflict rejection.
- **Commercial hypothesis:** Foundation for route-history proof.
- **Boundary:** Any ambiguous lineage is unavailable, not guessed.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_LIFECYCLE_REGISTRY_CONTRACT_V1.md`; `app-web/tests/frontend/coin-card-lifecycle-resolution.test.js`; `app-web/tests/frontend/coin-card-lifecycle-presentation.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** preserve through integration.

### CC-16 — Currentness and temporal resolution

- **Record class:** Control
- **Parent capability:** PC-10 — Coin Card lifecycle and route authority
- **Area / phase / side / type:** Trust architecture / V1 / both / lifecycle resolution
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Determine which authenticated record is effective at one verifier-owned instant.
- **Parent user value:** A payer can tell whether the route is presently authorized and how it changed.
- **Parent strategic role:** Adds route lineage and revocation evidence beyond a simple mutable name.
- **Strategic-role tags:** Trust; Evidence; Security/assurance
- **Current implementation:** Effective-from/until, future/past/gap/overlap handling and temporal status interpretation exist. Pilot validity policy is still a decision.
- **Remaining work:** Complete the named hardening, canonical integration, and production-evidence conditions before advancing maturity.
- **Dependencies:** Selected evidence, trusted time, skew policy, maximum lifetime, and immutable result.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Selected evidence, trusted time, skew policy, maximum lifetime, and immutable result.
- **Commercial hypothesis:** Enables “valid through” claims.
- **Boundary:** Never let a caller choose verification time to revive an invalid route.
- **Stop rule:** Never let a caller choose verification time to revive an invalid route.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_LIFECYCLE_REGISTRY_CONTRACT_V1.md`; `app-web/tests/frontend/coin-card-lifecycle-resolution.test.js`; `app-web/tests/frontend/coin-card-lifecycle-presentation.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** ratify 90-day/actual pilot validity policy.

### CC-17 — Expiration

- **Record class:** Control
- **Parent capability:** PC-10 — Coin Card lifecycle and route authority
- **Area / phase / side / type:** Credential lifecycle / V1 / both / status behavior
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Force time-bounded trust and reverification instead of treating wallet control as permanent.
- **Parent user value:** A payer can tell whether the route is presently authorized and how it changed.
- **Parent strategic role:** Adds route lineage and revocation evidence beyond a simple mutable name.
- **Strategic-role tags:** Trust; Evidence; Security/assurance
- **Current implementation:** Expired state is modeled, copied, and blocked in tests. Issuance validity, warning window, renewal/reverification, and pilot operations are not ratified.
- **Remaining work:** Complete the named hardening, canonical integration, and production-evidence conditions before advancing maturity.
- **Dependencies:** CC-16, validity policy, presentation copy, execution block, and reissue procedure.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: CC-16, validity policy, presentation copy, execution block, and reissue procedure.
- **Commercial hypothesis:** Supports maintained credentials; do not use expiry solely to manufacture billing pressure.
- **Boundary:** The record remains within the governing self-custody, data, security, and scope boundaries.
- **Stop rule:** Supports maintained credentials; do not use expiry solely to manufacture billing pressure.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_LIFECYCLE_REGISTRY_CONTRACT_V1.md`; `app-web/tests/frontend/coin-card-lifecycle-resolution.test.js`; `app-web/tests/frontend/coin-card-lifecycle-presentation.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** validity decision and runbook.

### CC-18 — Suspension

- **Record class:** Control
- **Parent capability:** PC-10 — Coin Card lifecycle and route authority
- **Area / phase / side / type:** Credential lifecycle / V1 / both / temporary control
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Temporarily block payment while a security, billing, or policy issue is reviewed without deleting evidence.
- **Parent user value:** A payer can tell whether the route is presently authorized and how it changed.
- **Parent strategic role:** Adds route lineage and revocation evidence beyond a simple mutable name.
- **Strategic-role tags:** Trust; Evidence; Security/assurance
- **Current implementation:** Suspended lifecycle outcomes and blocked presentation exist in tests.
- **Remaining work:** Authority, reason codes, support copy, appeal, and live rehearsal remain.
- **Dependencies:** CC-13, audit record, fail-closed registry, public/private reason separation, and unsuspend policy.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: CC-13, audit record, fail-closed registry, public/private reason separation, and unsuspend policy.
- **Commercial hypothesis:** Operational trust control.
- **Boundary:** Do not imply funds are frozen; only the ImplicitEx route is disabled.
- **Stop rule:** Do not imply funds are frozen; only the ImplicitEx route is disabled.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_LIFECYCLE_REGISTRY_CONTRACT_V1.md`; `app-web/tests/frontend/coin-card-lifecycle-resolution.test.js`; `app-web/tests/frontend/coin-card-lifecycle-presentation.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** V1 suspension runbook.

### CC-19 — Revocation

- **Record class:** Control
- **Parent capability:** PC-10 — Coin Card lifecycle and route authority
- **Area / phase / side / type:** Credential lifecycle / V1 / both / terminal control
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Permanently disable a compromised, abusive, or withdrawn credential while preserving historical proof.
- **Parent user value:** A payer can tell whether the route is presently authorized and how it changed.
- **Parent strategic role:** Adds route lineage and revocation evidence beyond a simple mutable name.
- **Strategic-role tags:** Trust; Evidence; Security/assurance
- **Current implementation:** Revoked states, runtime blocking, and registry schema exist.
- **Remaining work:** Customer proof, administrative case record, reason codes, and live rehearsal remain.
- **Dependencies:** CC-13, incident authority, immutable history, support procedure, and payment block.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: CC-13, incident authority, immutable history, support procedure, and payment block.
- **Commercial hypothesis:** Central route-management value.
- **Boundary:** Never delete the signed historical record as the revocation mechanism.
- **Stop rule:** Never delete the signed historical record as the revocation mechanism.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_LIFECYCLE_REGISTRY_CONTRACT_V1.md`; `app-web/tests/frontend/coin-card-lifecycle-resolution.test.js`; `app-web/tests/frontend/coin-card-lifecycle-presentation.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** V1 revocation rehearsal.

### CC-20 — Replacement and supersession

- **Record class:** Control
- **Parent capability:** PC-10 — Coin Card lifecycle and route authority
- **Area / phase / side / type:** Credential lifecycle / V1 / payee / lineage transition
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Move to a new manifest or card while proving the old route is no longer current.
- **Parent user value:** A payer can tell whether the route is presently authorized and how it changed.
- **Parent strategic role:** Adds route lineage and revocation evidence beyond a simple mutable name.
- **Strategic-role tags:** Trust; Evidence; Security/assurance
- **Current implementation:** Superseded/replaced states and lineage contracts exist.
- **Remaining work:** Customer workflow, redirect rules, prior-payer notice, and live rehearsal do not.
- **Dependencies:** Coherent lineage, registry update, immutable old record, new wallet proof, and fail-closed old execution.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Coherent lineage, registry update, immutable old record, new wallet proof, and fail-closed old execution.
- **Commercial hypothesis:** Stronger than ordinary current resolution only if users value history.
- **Boundary:** Do not redirect silently without visible status.
- **Stop rule:** Do not redirect silently without visible status.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_LIFECYCLE_REGISTRY_CONTRACT_V1.md`; `app-web/tests/frontend/coin-card-lifecycle-resolution.test.js`; `app-web/tests/frontend/coin-card-lifecycle-presentation.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** V1 replacement runbook.

### CC-21 — Rollback and stale-registry protection

- **Record class:** Control
- **Parent capability:** PC-10 — Coin Card lifecycle and route authority
- **Area / phase / side / type:** Trust architecture / V1 / both / anti-rollback control
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Prevent an older but authentically signed registry bundle from reviving a revoked or superseded route.
- **Parent user value:** A payer can tell whether the route is presently authorized and how it changed.
- **Parent strategic role:** Adds route lineage and revocation evidence beyond a simple mutable name.
- **Strategic-role tags:** Trust; Evidence; Security/assurance
- **Current implementation:** Registry version/current-head constraints, maximum lifetime, and rollback-blocking tests exist.
- **Remaining work:** Live stale-CDN/rollback drill and canonical integration remain.
- **Dependencies:** Monotonic registry identity, signed head, trusted time, cache policy, and degraded unavailable state.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Monotonic registry identity, signed head, trusted time, cache policy, and degraded unavailable state.
- **Commercial hypothesis:** Essential to current-route authority.
- **Boundary:** Any accepted rollback is a critical release blocker.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_LIFECYCLE_REGISTRY_CONTRACT_V1.md`; `app-web/tests/frontend/coin-card-lifecycle-resolution.test.js`; `app-web/tests/frontend/coin-card-lifecycle-presentation.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** include in V1 failure rehearsal.

### CC-22 — Lifecycle presentation promotion

- **Record class:** Control
- **Parent capability:** PC-10 — Coin Card lifecycle and route authority
- **Area / phase / side / type:** Trust UI / V1 / payer / presentation gate
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Permit trusted card presentation only from a genuine resolved lifecycle result, while keeping execution separately unauthorized.
- **Parent user value:** A payer can tell whether the route is presently authorized and how it changed.
- **Parent strategic role:** Adds route lineage and revocation evidence beyond a simple mutable name.
- **Strategic-role tags:** Trust; Evidence; Security/assurance
- **Current implementation:** Exclusive promotion, private proof predicate, blocked outcome copy, and immutable results are implemented.
- **Remaining work:** Complete the named hardening, canonical integration, and production-evidence conditions before advancing maturity.
- **Dependencies:** Authenticated selection and resolution, exact status mapping, no caller-created lookalikes, and runtime test.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Authenticated selection and resolution, exact status mapping, no caller-created lookalikes, and runtime test.
- **Commercial hypothesis:** Prevents a visual “verified” badge from becoming execution authority.
- **Boundary:** Any parallel UI trust path is prohibited.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_LIFECYCLE_REGISTRY_CONTRACT_V1.md`; `app-web/tests/frontend/coin-card-lifecycle-resolution.test.js`; `app-web/tests/frontend/coin-card-lifecycle-presentation.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** preserve.

### CC-23 — Verification-state copy and display contract

- **Record class:** Control
- **Parent capability:** PC-10 — Coin Card lifecycle and route authority
- **Area / phase / side / type:** Trust UI / V1 / payer / user-visible states
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Show authenticated, expired, suspended, revoked, superseded, invalid, and unavailable states honestly.
- **Parent user value:** A payer can tell whether the route is presently authorized and how it changed.
- **Parent strategic role:** Adds route lineage and revocation evidence beyond a simple mutable name.
- **Strategic-role tags:** Trust; Evidence; Security/assurance
- **Current implementation:** Copy contract and runtime states exist.
- **Remaining work:** Full-address access, public reason framing, and live failure-path review remain.
- **Dependencies:** Lifecycle outcome, signed payload display, no reconstructed facts, accessible copy, and payment block.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Lifecycle outcome, signed payload display, no reconstructed facts, accessible copy, and payment block.
- **Commercial hypothesis:** Makes trust legible.
- **Boundary:** Never collapse “signature valid” into “current route valid” or “person verified. ”
- **Stop rule:** Never collapse “signature valid” into “current route valid” or “person verified.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_LIFECYCLE_REGISTRY_CONTRACT_V1.md`; `app-web/tests/frontend/coin-card-lifecycle-resolution.test.js`; `app-web/tests/frontend/coin-card-lifecycle-presentation.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** V1 structured copy review.

### CC-24 — Coin Card execution authorization

- **Record class:** Control
- **Parent capability:** PC-11 — Coin Card execution authorization and evidence verification
- **Area / phase / side / type:** Execution security / V1 / payer / authorization gate
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Require the conjunction of verified manifest, current lifecycle, and current wallet/execution facts before allowing a transfer.
- **Parent user value:** The payer can review the exact authorized route and a third party can verify what settled.
- **Parent strategic role:** Creates the portable chain of evidence around execution without promising insurance.
- **Strategic-role tags:** Execution; Evidence; Trust; Security/assurance
- **Current implementation:** Three-input gate, exclusive authorization result, pinned plan, one-shot consumption, and firewall tests exist.
- **Remaining work:** Complete the named hardening, canonical integration, and production-evidence conditions before advancing maturity.
- **Dependencies:** CC-22, provider/account/chain snapshot, exact route, balance, policy, and no alternative execution path.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: CC-22, provider/account/chain snapshot, exact route, balance, policy, and no alternative execution path.
- **Commercial hypothesis:** Core trust architecture.
- **Boundary:** Any surface that can bypass the authorization proof blocks release.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_EXECUTION_AUTHORIZATION_CONTRACT_V1.md`; `app-web/tests/frontend/coin-card-execution-authorization.test.js`; `app-web/tests/frontend/coin-card-provider-continuity.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** preserve through integration and V1 smoke.

### CC-25 — Replay prevention and one-shot authorization

- **Record class:** Control
- **Parent capability:** PC-11 — Coin Card execution authorization and evidence verification
- **Area / phase / side / type:** Execution security / V1 / payer / replay control
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Prevent a valid execution proof from authorizing a second or altered wallet write.
- **Parent user value:** The payer can review the exact authorized route and a third party can verify what settled.
- **Parent strategic role:** Creates the portable chain of evidence around execution without promising insurance.
- **Strategic-role tags:** Execution; Evidence; Trust; Security/assurance
- **Current implementation:** Private proof identity, permanent consumption after authorized attempts, and second-call failure tests exist.
- **Remaining work:** Complete the named hardening, canonical integration, and production-evidence conditions before advancing maturity.
- **Dependencies:** Immutable proof, pinned facts, consumption before relevant failure exits, and no cloning.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Immutable proof, pinned facts, consumption before relevant failure exits, and no cloning.
- **Commercial hypothesis:** Security invariant.
- **Boundary:** Any reusable proof is a critical blocker.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_EXECUTION_AUTHORIZATION_CONTRACT_V1.md`; `app-web/tests/frontend/coin-card-execution-authorization.test.js`; `app-web/tests/frontend/coin-card-provider-continuity.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** preserve.

### CC-26 — Coin Card provider/account/chain continuity

- **Record class:** Control
- **Parent capability:** PC-11 — Coin Card execution authorization and evidence verification
- **Area / phase / side / type:** Execution security / V1 / payer / TOCTOU control
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Bind Coin Card review to the exact live provider, account, and chain used to execute.
- **Parent user value:** The payer can review the exact authorized route and a third party can verify what settled.
- **Parent strategic role:** Creates the portable chain of evidence around execution without promising insurance.
- **Strategic-role tags:** Execution; Evidence; Trust; Security/assurance
- **Current implementation:** Injected/WalletConnect happy paths, mismatch, disconnect, account drift, chain drift, and rejection tests exist.
- **Remaining work:** Complete the named hardening, canonical integration, and production-evidence conditions before advancing maturity.
- **Dependencies:** CC-24, provider snapshot, one-shot proof, live equality reads, and no write on mismatch.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: CC-24, provider snapshot, one-shot proof, live equality reads, and no write on mismatch.
- **Commercial hypothesis:** Prevents execution-context substitution.
- **Boundary:** Any automatic provider retry is prohibited.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_EXECUTION_AUTHORIZATION_CONTRACT_V1.md`; `app-web/tests/frontend/coin-card-execution-authorization.test.js`; `app-web/tests/frontend/coin-card-provider-continuity.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** preserve in canonical merge.

### CC-27 — Execution interface descriptor

- **Record class:** Control
- **Parent capability:** PC-11 — Coin Card execution authorization and evidence verification
- **Area / phase / side / type:** Evidence authority / V1 / both / content-addressed execution contract
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Bind evidence to the exact deployed code, ABI, fee policy, calldata, revert behavior, and emitted event rather than a token symbol or UI constant.
- **Parent user value:** The payer can review the exact authorized route and a third party can verify what settled.
- **Parent strategic role:** Creates the portable chain of evidence around execution without promising insurance.
- **Strategic-role tags:** Execution; Evidence; Trust; Security/assurance
- **Current implementation:** Sealed normative contract, deterministic fixtures, tests, and runtime content verification exist.
- **Remaining work:** Canonical branch integration and complete live evidence generation remain.
- **Dependencies:** Deployed bytecode identity, chain/contract policy, selector/event decoding, and replay-binding fields.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Deployed bytecode identity, chain/contract policy, selector/event decoding, and replay-binding fields.
- **Commercial hypothesis:** Makes portable proof meaningful.
- **Boundary:** Never infer execution authority from display metadata.
- **Stop rule:** Never infer execution authority from display metadata.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_EXECUTION_AUTHORIZATION_CONTRACT_V1.md`; `app-web/tests/frontend/coin-card-execution-authorization.test.js`; `app-web/tests/frontend/coin-card-provider-continuity.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** V1 evidence-path verification.

### CC-28 — Lifecycle/executable-registry identity equality

- **Record class:** Control
- **Parent capability:** PC-11 — Coin Card execution authorization and evidence verification
- **Area / phase / side / type:** Evidence authority / V1 / both / cross-record invariant
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Require executable registry facts to equal authenticated lifecycle identity rather than silently migrating or reinterpreting legacy values.
- **Parent user value:** The payer can review the exact authorized route and a third party can verify what settled.
- **Parent strategic role:** Creates the portable chain of evidence around execution without promising insurance.
- **Strategic-role tags:** Execution; Evidence; Trust; Security/assurance
- **Current implementation:** Sealed schema, fixtures, migration boundary, runtime validation, and tests exist.
- **Remaining work:** Production V2 registry publication remains gated.
- **Dependencies:** Authenticated lifecycle head, explicit reauthorization, equality checks, and no legacy inference.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Authenticated lifecycle head, explicit reauthorization, equality checks, and no legacy inference.
- **Commercial hypothesis:** Prevents trusted presentation from pointing to untrusted execution.
- **Boundary:** Any mismatch blocks payment.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_EXECUTION_AUTHORIZATION_CONTRACT_V1.md`; `app-web/tests/frontend/coin-card-execution-authorization.test.js`; `app-web/tests/frontend/coin-card-provider-continuity.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** preserve and validate active V1 records.

### CC-29 — Transaction Evidence v1 content validation

- **Record class:** Control
- **Parent capability:** PC-11 — Coin Card execution authorization and evidence verification
- **Area / phase / side / type:** Evidence / V1 / both / deterministic proof contract
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Reconcile authenticated card authority, frozen user intent, observed execution, policy, and settlement under one deterministic evidence schema.
- **Parent user value:** The payer can review the exact authorized route and a third party can verify what settled.
- **Parent strategic role:** Creates the portable chain of evidence around execution without promising insurance.
- **Strategic-role tags:** Execution; Evidence; Trust; Security/assurance
- **Current implementation:** Sealed v1 contract, fixtures, content verifier, and tests exist. v1 cannot itself authenticate a signature because signing time and key ID are absent.
- **Remaining work:** Complete the named hardening, canonical integration, and production-evidence conditions before advancing maturity.
- **Dependencies:** CC-27/28, intent snapshot, chain truth, strict compatibility, and deterministic rejection.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: CC-27/28, intent snapshot, chain truth, strict compatibility, and deterministic rejection.
- **Commercial hypothesis:** Foundation for evidence packets; not yet a complete independently authenticated artifact.
- **Boundary:** The record remains within the governing self-custody, data, security, and scope boundaries.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_TRANSACTION_EVIDENCE_CONTRACT_V1.md`; `docs/product/coin-card/COIN_CARD_TRANSACTION_EVIDENCE_CONTRACT_V2.md`; `app-web/tests/frontend/coin-card-transaction-evidence-content-verification.test.js`; `app-web/tests/frontend/coin-card-transaction-evidence-signature-contract.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** use as V1 content baseline while accurately disclosing its signature limit.

### CC-30 — Transaction Evidence v2 signature authentication

- **Record class:** Control
- **Parent capability:** PC-11 — Coin Card execution authorization and evidence verification
- **Area / phase / side / type:** Evidence / V1→V2 / both / signed proof contract
- **Implementation maturity:** Partially implemented
- **Work authorization:** Ready but not queued
- **Purpose:** Add signed signing-time and key identity so a portable evidence packet can authenticate its evidence authority.
- **Parent user value:** The payer can review the exact authorized route and a third party can verify what settled.
- **Parent strategic role:** Creates the portable chain of evidence around execution without promising insurance.
- **Strategic-role tags:** Execution; Evidence; Trust; Security/assurance
- **Current implementation:** V2 contract, trusted-key v2 contract, fixtures, and conformance tests are sealed. The canonical README states no production key, runtime resolver, content verifier, current source, or execution path implements the sealed unit.
- **Remaining work:** Complete the unresolved end-to-end implementation and evidence conditions stated in this record.
- **Dependencies:** GOV-04, v2 trusted-key usage, signing service, resolver, runtime verifier, publication, and migration.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: GOV-04, v2 trusted-key usage, signing service, resolver, runtime verifier, publication, and migration.
- **Commercial hypothesis:** Stronger independent proof only if V1/V2 users value it.
- **Boundary:** Do not mislabel v1 packets as signature-authenticated.
- **Stop rule:** Do not mislabel v1 packets as signature-authenticated.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_TRANSACTION_EVIDENCE_CONTRACT_V1.md`; `docs/product/coin-card/COIN_CARD_TRANSACTION_EVIDENCE_CONTRACT_V2.md`; `app-web/tests/frontend/coin-card-transaction-evidence-content-verification.test.js`; `app-web/tests/frontend/coin-card-transaction-evidence-signature-contract.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** gap decision during signed-record ratification; no implementation expansion without V1 evidence.

### CC-31 — Governing route-version preservation

- **Record class:** Control
- **Parent capability:** PC-11 — Coin Card execution authorization and evidence verification
- **Area / phase / side / type:** Evidence / V1 / both / payment-time lineage
- **Implementation maturity:** Defined or specified
- **Work authorization:** Ready but not queued
- **Purpose:** Preserve the exact route revision and lifecycle authority that governed a payment, even after later route change.
- **Parent user value:** The payer can review the exact authorized route and a third party can verify what settled.
- **Parent strategic role:** Creates the portable chain of evidence around execution without promising insurance.
- **Strategic-role tags:** Execution; Evidence; Trust; Security/assurance
- **Current implementation:** Lineage contracts and receipt/proof foundations exist.
- **Remaining work:** The live complete payment packet has not yet demonstrated the signed governing route through a customer payment.
- **Dependencies:** CC-15/16/27/29, immutable transaction-time snapshot, settlement, and third-party verification.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: CC-15/16/27/29, immutable transaction-time snapshot, settlement, and third-party verification.
- **Commercial hypothesis:** Central surviving distinction.
- **Boundary:** Narrow or stop if customers never use lineage in reconciliation, dispute, or route-change workflows.
- **Stop rule:** Narrow or stop if customers never use lineage in reconciliation, dispute, or route-change workflows.
- **Source / evidence locator:** Capability register route lineage record.
- **Next action:** build and test the smallest V1 route-preserving packet.

### CC-32 — Fail-closed unavailable state

- **Record class:** Control
- **Parent capability:** PC-11 — Coin Card execution authorization and evidence verification
- **Area / phase / side / type:** Trust runtime / V1 / payer / failure policy
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Block payment when registry, key, schema, signature, lifecycle, or authority cannot be established.
- **Parent user value:** The payer can review the exact authorized route and a third party can verify what settled.
- **Parent strategic role:** Creates the portable chain of evidence around execution without promising insurance.
- **Strategic-role tags:** Execution; Evidence; Trust; Security/assurance
- **Current implementation:** Unavailable/unknown/invalid outcomes and execution blocking are extensively tested.
- **Remaining work:** Live registry/network outage rehearsal and customer copy review remain.
- **Dependencies:** No cached-success fallback, explicit state, full-address visibility, support guidance, and zero writes.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: No cached-success fallback, explicit state, full-address visibility, support guidance, and zero writes.
- **Commercial hypothesis:** Trust boundary.
- **Boundary:** Availability pressure may not weaken authorization.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_TRANSACTION_EVIDENCE_CONTRACT_V1.md`; `docs/product/coin-card/COIN_CARD_TRANSACTION_EVIDENCE_CONTRACT_V2.md`; `app-web/tests/frontend/coin-card-transaction-evidence-content-verification.test.js`; `app-web/tests/frontend/coin-card-transaction-evidence-signature-contract.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** V1 outage drill.

### CC-33 — Independent verifier

- **Record class:** Control
- **Parent capability:** PC-11 — Coin Card execution authorization and evidence verification
- **Area / phase / side / type:** Evidence / V1 / both / verification tool
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Let a third party validate signed card and lifecycle evidence without trusting mutable ImplicitEx presentation.
- **Parent user value:** The payer can review the exact authorized route and a third party can verify what settled.
- **Parent strategic role:** Creates the portable chain of evidence around execution without promising insurance.
- **Strategic-role tags:** Execution; Evidence; Trust; Security/assurance
- **Current implementation:** Browser/runtime verification modules and local production-artifact smoke exist.
- **Remaining work:** A separately usable verifier package, public test vectors, and external-party verification evidence remain.
- **Dependencies:** Canonical artifacts, trusted key source, no live-response authority, clear result taxonomy, and offline/independent test.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Canonical artifacts, trusted key source, no live-response authority, clear result taxonomy, and offline/independent test.
- **Commercial hypothesis:** Supports portability.
- **Boundary:** Stop overbuilding if users only need ordinary current route resolution.
- **Stop rule:** Stop overbuilding if users only need ordinary current route resolution.
- **Source / evidence locator:** `docs/product/coin-card/COIN_CARD_TRANSACTION_EVIDENCE_CONTRACT_V1.md`; `docs/product/coin-card/COIN_CARD_TRANSACTION_EVIDENCE_CONTRACT_V2.md`; `app-web/tests/frontend/coin-card-transaction-evidence-content-verification.test.js`; `app-web/tests/frontend/coin-card-transaction-evidence-signature-contract.test.js`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** define and run V1 independent-verifier acceptance.

### CC-34 — Hosted Coin Card

- **Record class:** Capability
- **Parent capability:** PC-12 — Hosted Coin Card presentation and handoff
- **Area / phase / side / type:** Payment identity / V1 / both / customer surface
- **Implementation maturity:** Release-evidenced
- **Work authorization:** Deferred
- **Purpose:** Present a complete payment credential and execution flow at one stable route.
- **Parent user value:** Recipients can share one destination and payers can enter a clear review flow.
- **Parent strategic role:** Provides the distribution surface for the controlled V1 credential pilot.
- **Strategic-role tags:** Distribution/access; Trust; Payer usability
- **Current implementation:** Live `/card/antoine` and demo card, responsive execution shell, QR presentation, and browser production smoke exist. Controlled external recipients and full lifecycle operations do not.
- **Remaining work:** No active feature work is authorized; preserve and maintain the evidenced behavior unless a later gate opens a change.
- **Dependencies:** Entire verified trust stack, route registry, execution authority, failure states, and production smoke.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Entire verified trust stack, route registry, execution authority, failure states, and production smoke.
- **Commercial hypothesis:** Primary V1 placement object.
- **Boundary:** A demo is not pilot adoption.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** `app-web/frontend/public/card/`; `app-web/tests/browser/coin-card-production-artifact.test.js`; `docs/operations/evidence/coincard-existing-portal-handoff-2026-06-29.md`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** controlled issuance after binding V1 gates.

### CC-35 — Static iframe/embed surface

- **Record class:** Capability
- **Parent capability:** PC-12 — Hosted Coin Card presentation and handoff
- **Area / phase / side / type:** Distribution / V1 / payee / embed
- **Implementation maturity:** Partially implemented
- **Work authorization:** Ready but not queued
- **Purpose:** Let recipients place the persistent payment identity on an existing site without arbitrary script injection.
- **Parent user value:** Recipients can share one destination and payers can enter a clear review flow.
- **Parent strategic role:** Provides the distribution surface for the controlled V1 credential pilot.
- **Strategic-role tags:** Distribution/access; Trust; Payer usability
- **Current implementation:** Card paths permit framing and prior handoff/embed work exists.
- **Remaining work:** Real external placement, CSP compatibility, resize behavior, and stale/revoked embed smoke remain.
- **Dependencies:** Stable route, frame-safe CSP, fail-closed lifecycle, full-address access, and external-site evidence.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Stable route, frame-safe CSP, fail-closed lifecycle, full-address access, and external-site evidence.
- **Commercial hypothesis:** Distribution mechanism for V1 placement.
- **Boundary:** Stop if target operators only share links and do not embed.
- **Stop rule:** Stop if target operators only share links and do not embed.
- **Source / evidence locator:** `app-web/frontend/public/card/`; `app-web/tests/browser/coin-card-production-artifact.test.js`; `docs/operations/evidence/coincard-existing-portal-handoff-2026-06-29.md`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** define static embed acceptance and place with pilot.

### CC-36 — Coin Card-to-portal handoff

- **Record class:** Capability
- **Parent capability:** PC-12 — Hosted Coin Card presentation and handoff
- **Area / phase / side / type:** Access / existing / payer / intake adapter
- **Implementation maturity:** Implemented and tested
- **Work authorization:** Ready but not queued
- **Purpose:** Carry card identity and optional amount into the existing portal without duplicating wallet or transfer logic.
- **Parent user value:** Recipients can share one destination and payers can enter a clear review flow.
- **Parent strategic role:** Provides the distribution surface for the controlled V1 credential pilot.
- **Strategic-role tags:** Distribution/access; Trust; Payer usability
- **Current implementation:** Safe URL intake, registry recipient authority, hostile `to=` rejection, no auto-connect/execute, and staging smoke exist.
- **Remaining work:** Failure-state and broader wallet smoke remain incomplete, and later direct Coin Card execution may supersede portions.
- **Dependencies:** Verified registry, safe deep link, explicit user action, failure states, and current product flow decision.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Verified registry, safe deep link, explicit user action, failure states, and current product flow decision.
- **Commercial hypothesis:** Coordination aid, not a second portal.
- **Boundary:** Never accept recipient authority from URL query parameters.
- **Stop rule:** Never accept recipient authority from URL query parameters.
- **Source / evidence locator:** `app-web/frontend/public/card/`; `app-web/tests/browser/coin-card-production-artifact.test.js`; `docs/operations/evidence/coincard-existing-portal-handoff-2026-06-29.md`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** preserve only if V1 selected flow still uses it.

### CC-37 — Coin Card QR presentation

- **Record class:** Capability
- **Parent capability:** PC-12 — Hosted Coin Card presentation and handoff
- **Area / phase / side / type:** Access / existing / payee / identity handoff
- **Implementation maturity:** Release-evidenced
- **Work authorization:** Deferred
- **Purpose:** Present a canonical card URL for another device without embedding mutable payment amount or recipient facts.
- **Parent user value:** Recipients can share one destination and payers can enter a clear review flow.
- **Parent strategic role:** Provides the distribution surface for the controlled V1 credential pilot.
- **Strategic-role tags:** Distribution/access; Trust; Payer usability
- **Current implementation:** Verified-only lazy QR library loading, integrity attestation, canonical URL, decode tests, focus behavior, and revoked-state blocking exist. Signed payment-request QR belongs to later V3.
- **Remaining work:** No active feature work is authorized; preserve and maintain the evidenced behavior unless a later gate opens a change.
- **Dependencies:** Verified card, integrity-checked QR dependency, no amount/query recipient, and decode equality.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Verified card, integrity-checked QR dependency, no amount/query recipient, and decode equality.
- **Commercial hypothesis:** Useful identity distribution, not unique payment-request value.
- **Boundary:** Do not conflate it with V3 QR/POS requests.
- **Stop rule:** Do not conflate it with V3 QR/POS requests.
- **Source / evidence locator:** `app-web/frontend/public/card/`; `app-web/tests/browser/coin-card-production-artifact.test.js`; `docs/operations/evidence/coincard-existing-portal-handoff-2026-06-29.md`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** maintenance.

### CC-38 — Controlled issuance workflow

- **Record class:** Operational process
- **Parent capability:** PC-13 — Controlled Coin Card issuance and recovery
- **Area / phase / side / type:** Pilot operations / V1 / payee / administrative workflow
- **Implementation maturity:** Defined or specified
- **Work authorization:** Ready but not queued
- **Purpose:** Issue a manually approved, time-limited credential through repeatable evidence-backed steps.
- **Parent user value:** A recipient receives a maintained credential instead of a one-time static page.
- **Parent strategic role:** Tests whether lifecycle maintenance is valuable and supportable before self-service issuance.
- **Strategic-role tags:** Trust; Payee operations; Support/operations; Security/assurance
- **Current implementation:** Provisioning/signing tooling and demo artifacts exist.
- **Remaining work:** Approved-cohort intake, production wallet proof, entitlement, namespace review, exact issuance checklist, retained evidence, and rehearsal remain.
- **Dependencies:** CC-03/04/08/10/13, Gate 1A, validity decision, private case record, and live verification.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: CC-03/04/08/10/13, Gate 1A, validity decision, private case record, and live verification.
- **Commercial hypothesis:** V1 market test.
- **Boundary:** No public self-service or implied free tier.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** V1 issuance sequence and provisioning scripts.
- **Next action:** close Gate 1A and ratify issuance authority.

### CC-39 — Reverification

- **Record class:** Operational process
- **Parent capability:** PC-13 — Controlled Coin Card issuance and recovery
- **Area / phase / side / type:** Credential operations / V1 / payee / recurring control proof
- **Implementation maturity:** Defined or specified
- **Work authorization:** Decision required
- **Purpose:** Refresh wallet-control and route evidence before a credential becomes stale.
- **Parent user value:** A recipient receives a maintained credential instead of a one-time static page.
- **Parent strategic role:** Tests whether lifecycle maintenance is valuable and supportable before self-service issuance.
- **Strategic-role tags:** Trust; Payee operations; Support/operations; Security/assurance
- **Current implementation:** Expiration/currentness primitives exist; interval, warning, challenge reuse prohibition, customer communication, and renewed manifest/lifecycle flow are not ratified.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** CC-04/16/17, validity policy, new challenge, new immutable version, and historical preservation.
- **Entry gate:** The named governing decision is ratified and recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: CC-04/16/17, validity policy, new challenge, new immutable version, and historical preservation.
- **Commercial hypothesis:** Supports maintained credential value.
- **Boundary:** Reverification must be security-driven, not artificial churn.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** V1 roadmap validity hypothesis.
- **Next action:** decide before first issuance.

### CC-40 — Compromise recovery

- **Record class:** Operational process
- **Parent capability:** PC-13 — Controlled Coin Card issuance and recovery
- **Area / phase / side / type:** Credential operations / V1 / payee / incident workflow
- **Implementation maturity:** Defined or specified
- **Work authorization:** Ready but not queued
- **Purpose:** Respond when recipient wallet, signing key, admin account, route, or served content may be compromised.
- **Parent user value:** A recipient receives a maintained credential instead of a one-time static page.
- **Parent strategic role:** Tests whether lifecycle maintenance is valuable and supportable before self-service issuance.
- **Strategic-role tags:** Trust; Payee operations; Support/operations; Security/assurance
- **Current implementation:** Lifecycle controls and general incident doctrine exist.
- **Remaining work:** Scenario-specific detection, authority, suspend/revoke/reissue sequence, communications, and rehearsal remain.
- **Dependencies:** CC-10/18/19/20, security contacts, evidence preservation, rollback, and post-incident verification.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: CC-10/18/19/20, security contacts, evidence preservation, rollback, and post-incident verification.
- **Commercial hypothesis:** Operational trust value.
- **Boundary:** Recovery means route/credential administration, never recovery of customer funds.
- **Stop rule:** Recovery means route/credential administration, never recovery of customer funds.
- **Source / evidence locator:** security review requirements and V1 runbooks.
- **Next action:** draft and rehearse before pilot.

### CC-41 — Issuance and lifecycle audit history

- **Record class:** Operational process
- **Parent capability:** PC-13 — Controlled Coin Card issuance and recovery
- **Area / phase / side / type:** Credential operations / V1 / both / audit record
- **Implementation maturity:** Partially implemented
- **Work authorization:** Ready but not queued
- **Purpose:** Preserve who issued, changed, suspended, revoked, replaced, or republished a credential and on what evidence.
- **Parent user value:** A recipient receives a maintained credential instead of a one-time static page.
- **Parent strategic role:** Tests whether lifecycle maintenance is valuable and supportable before self-service issuance.
- **Strategic-role tags:** Trust; Payee operations; Support/operations; Security/assurance
- **Current implementation:** Signed records and repository evidence preserve some history.
- **Remaining work:** Private administrative case references, reason codes, actor authority, and a searchable lifecycle audit do not.
- **Dependencies:** CC-13, minimal V1 data policy, access control, immutable public facts/private notes split, and retention.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: CC-13, minimal V1 data policy, access control, immutable public facts/private notes split, and retention.
- **Commercial hypothesis:** Necessary for credible support and disputes; avoid collecting detailed accusations publicly.
- **Boundary:** The record remains within the governing self-custody, data, security, and scope boundaries.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** `app-web/docs/product/coin-card/COIN_CARD_WALLET_OWNERSHIP_API_V1.md`; `app-web/backend/functions/test/wallet-challenge.test.js`; `docs/product/coin-card/README.md`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** define minimal pilot audit record.

---

# 4. V1 controlled-pilot governance, security, operations, and evidence

### V1-01 — Signed-record stack ratification

- **Record class:** Governance decision
- **Parent capability:** PC-14 — V1 governing decisions and release boundaries
- **Area / phase / side / type:** Product authority / V1 / both / architecture decision
- **Implementation maturity:** Defined or specified
- **Work authorization:** Ready but not queued
- **Purpose:** Confirm the existing Coin Card contracts actually support the V1 claim before adding or redesigning trust infrastructure.
- **Parent user value:** Pilot users receive one coherent product whose behavior matches its stated boundaries.
- **Parent strategic role:** Prevents implementation from outrunning authority, privacy, or legal decisions.
- **Strategic-role tags:** Governance; Security/assurance; Trust
- **Current implementation:** A deep normative stack and extensive tests exist; gaps across v1/v2 evidence authority, production key operations, route packet, and canonical branches must be listed and accepted or scheduled.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** Canonical contract inventory, claims matrix, runtime mapping, gap disposition, and no parallel authority.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Canonical contract inventory, claims matrix, runtime mapping, gap disposition, and no parallel authority.
- **Commercial hypothesis:** Enables V1 trust without architecture theater.
- **Boundary:** Stop adding cryptography when it no longer changes a customer or release decision.
- **Stop rule:** Stop adding cryptography when it no longer changes a customer or release decision.
- **Source / evidence locator:** Coin Card README/contracts and roadmap §6.
- **Next action:** write one ratification record with accepted V1 claim and explicit gaps.

### V1-02 — Gate 1A production dependency closure

- **Record class:** Control
- **Parent capability:** PC-14 — V1 governing decisions and release boundaries
- **Area / phase / side / type:** Production security / V1 / payee / release gate
- **Implementation maturity:** Defined or specified
- **Work authorization:** Ready but not queued
- **Purpose:** Remove or resolve the staging-only dependency exception that prohibits genuine wallet-control issuance.
- **Parent user value:** Pilot users receive one coherent product whose behavior matches its stated boundaries.
- **Parent strategic role:** Prevents implementation from outrunning authority, privacy, or legal decisions.
- **Strategic-role tags:** Governance; Security/assurance; Trust
- **Current implementation:** The exception is deliberately fail-closed and the release suite recognizes it; production resolution is not recorded.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** Approved replacement or removal, dependency review, tests, production smoke, and updated release evidence.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Approved replacement or removal, dependency review, tests, production smoke, and updated release evidence.
- **Commercial hypothesis:** Binding gate.
- **Boundary:** Customer interest cannot authorize bypass.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** roadmap security section and Gate 1A runtime/evidence.
- **Next action:** isolate the exact exception and close it before pilot issuance.

### V1-03 — Structured production security review

- **Record class:** Control
- **Parent capability:** PC-14 — V1 governing decisions and release boundaries
- **Area / phase / side / type:** Security / V1 / both / release assessment
- **Implementation maturity:** Defined or specified
- **Work authorization:** Ready but not queued
- **Purpose:** Evaluate custody, authority, contracts, signed records, Firebase, dependencies, delivery, failure states, and operations as one pilot system.
- **Parent user value:** Pilot users receive one coherent product whose behavior matches its stated boundaries.
- **Parent strategic role:** Prevents implementation from outrunning authority, privacy, or legal decisions.
- **Strategic-role tags:** Governance; Security/assurance; Trust
- **Current implementation:** Numerous focused tests and architecture packets exist; the roadmap-required consolidated Fable review, finding register, and final disposition are not complete.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** V1-01, exact production tree, threat model, severity/exploitability, reproduction, remediation, regression test, owner, and disposition.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V1-01, exact production tree, threat model, severity/exploitability, reproduction, remediation, regression test, owner, and disposition.
- **Commercial hypothesis:** Binding release control.
- **Boundary:** Any unresolved critical/high finding blocks genuine issuance.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap §11 security review.
- **Next action:** conduct after canonical source and Gate 1A scope are known.

### V1-04 — Administrative-account hardening

- **Record class:** Control
- **Parent capability:** PC-14 — V1 governing decisions and release boundaries
- **Area / phase / side / type:** Security operations / V1 / internal / account control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Decision required
- **Purpose:** Reduce takeover risk across registrar, DNS, GitHub, Firebase, signing, and deployment authorities.
- **Parent user value:** Pilot users receive one coherent product whose behavior matches its stated boundaries.
- **Parent strategic role:** Prevents implementation from outrunning authority, privacy, or legal decisions.
- **Strategic-role tags:** Governance; Security/assurance; Trust
- **Current implementation:** Required hardware-backed MFA posture is documented; a dated account inventory, owner/recovery map, enforcement evidence, and break-glass procedure are not present in the reviewed evidence.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** Account enumeration, hardware keys where supported, least privilege, recovery protection, audit contacts, and verification screenshots/records stored privately.
- **Entry gate:** The named governing decision is ratified and recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Account enumeration, hardware keys where supported, least privilege, recovery protection, audit contacts, and verification screenshots/records stored privately.
- **Commercial hypothesis:** Binding security gate.
- **Boundary:** Do not publish sensitive recovery details in public documentation.
- **Stop rule:** Do not publish sensitive recovery details in public documentation.
- **Source / evidence locator:** V1 gate and security review scope.
- **Next action:** perform a private admin-control audit.

### V1-05 — Served-content integrity tripwire

- **Record class:** Control
- **Parent capability:** PC-14 — V1 governing decisions and release boundaries
- **Area / phase / side / type:** Delivery security / V1 / payer / monitoring control
- **Implementation maturity:** Partially implemented
- **Work authorization:** Ready but not queued
- **Purpose:** Detect when production serves altered payment-critical JavaScript, manifests, keys, or card artifacts.
- **Parent user value:** Pilot users receive one coherent product whose behavior matches its stated boundaries.
- **Parent strategic role:** Prevents implementation from outrunning authority, privacy, or legal decisions.
- **Strategic-role tags:** Governance; Security/assurance; Trust
- **Current implementation:** Predeploy manifest hashes and integrity proof tooling protect source/release artifacts; a continuously or independently observed live-content tripwire, alert path, and incident response are not demonstrated.
- **Remaining work:** Complete the unresolved end-to-end implementation and evidence conditions stated in this record.
- **Dependencies:** Protected asset manifest, live-domain fetch, expected hash authority, alert destination, false-positive handling, and rollback rehearsal.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Protected asset manifest, live-domain fetch, expected hash authority, alert destination, false-positive handling, and rollback rehearsal.
- **Commercial hypothesis:** Trust infrastructure.
- **Boundary:** A local predeploy check alone is not served-content monitoring.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** `firebase.json`; `app-web/frontend/public/v1-execution.html`; `docs/product/product-commercial-roadmap-2026-07-30.md`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** define minimal live tripwire and alert.

### V1-06 — Minimal V1 data classification, PII, and retention boundary

- **Record class:** Governance decision
- **Parent capability:** PC-14 — V1 governing decisions and release boundaries
- **Area / phase / side / type:** Privacy / V1 / both / data policy
- **Implementation maturity:** Defined or specified
- **Work authorization:** Ready but not queued
- **Purpose:** Limit pilot collection to what issuance, support, evidence, security, and customer learning actually need.
- **Parent user value:** Pilot users receive one coherent product whose behavior matches its stated boundaries.
- **Parent strategic role:** Prevents implementation from outrunning authority, privacy, or legal decisions.
- **Strategic-role tags:** Governance; Security/assurance; Trust
- **Current implementation:** Roadmap data classes and local-first principles exist; exact pilot fields, purpose, access, retention, deletion, and evidence consent are not approved.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** Issuance/evidence workflow, public/private split, legal review triggers, secure storage, and pilot notice.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Issuance/evidence workflow, public/private split, legal review triggers, secure storage, and pilot notice.
- **Commercial hypothesis:** Binding privacy control.
- **Boundary:** Do not collect email, identity documents, analytics, or support detail “for later. ”
- **Stop rule:** Do not collect email, identity documents, analytics, or support detail “for later.
- **Source / evidence locator:** Roadmap PII posture.
- **Next action:** approve a field-level V1 data table before cohort intake.

### V1-07 — Custody tripwire publication

- **Record class:** Governance decision
- **Parent capability:** PC-14 — V1 governing decisions and release boundaries
- **Area / phase / side / type:** Authority governance / V1 / both / design stop control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Ready but not queued
- **Purpose:** Give product and engineering explicit conditions that stop design before ImplicitEx gains control over funds.
- **Parent user value:** Pilot users receive one coherent product whose behavior matches its stated boundaries.
- **Parent strategic role:** Prevents implementation from outrunning authority, privacy, or legal decisions.
- **Strategic-role tags:** Governance; Security/assurance; Trust
- **Current implementation:** The roadmap lists twelve tripwires; an internal operational checklist and owner/escalation path are not separately published.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** Legal Development Hierarchy, architecture review template, and release signoff.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Legal Development Hierarchy, architecture review template, and release signoff.
- **Commercial hypothesis:** Master company boundary.
- **Boundary:** Triggering a tripwire requires written legal and architecture review, not clever naming.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap §11.
- **Next action:** ratify as internal release doctrine.

### V1-08 — Address-screening counsel determination

- **Record class:** Governance decision
- **Parent capability:** PC-14 — V1 governing decisions and release boundaries
- **Area / phase / side / type:** Legal/compliance / V1 / both / conditional release control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Legally gated
- **Purpose:** Determine whether the actual controlled V1 flow requires sanctions screening or another address control.
- **Parent user value:** Pilot users receive one coherent product whose behavior matches its stated boundaries.
- **Parent strategic role:** Prevents implementation from outrunning authority, privacy, or legal decisions.
- **Strategic-role tags:** Governance; Security/assurance; Trust
- **Current implementation:** Risk category and later control design are documented; no counsel determination for the final V1 flow is recorded.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** Exact user flow, jurisdictions, control/intervention facts, service claims, counsel analysis, and written disposition.
- **Entry gate:** The required counsel or formal legal determination is recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Exact user flow, jurisdictions, control/intervention facts, service claims, counsel analysis, and written disposition.
- **Commercial hypothesis:** If required, screening becomes a binding V1 gate.
- **Boundary:** It may never be marketed as a “safe address” guarantee.
- **Stop rule:** It may never be marketed as a “safe address” guarantee.
- **Source / evidence locator:** Roadmap V1 gate and conditional release record.
- **Next action:** include in fintech counsel package before first genuine payment.

### V1-09 — Controlled pilot entitlement

- **Record class:** Governance decision
- **Parent capability:** PC-14 — V1 governing decisions and release boundaries
- **Area / phase / side / type:** Pilot operations / V1 / payee / access control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Decision required
- **Purpose:** Limit credential issuance to approved, time-bounded pilot participants without prematurely building billing/accounts.
- **Parent user value:** Pilot users receive one coherent product whose behavior matches its stated boundaries.
- **Parent strategic role:** Prevents implementation from outrunning authority, privacy, or legal decisions.
- **Strategic-role tags:** Governance; Security/assurance; Trust
- **Current implementation:** Manual/time-limited concept exists.
- **Remaining work:** Authoritative entitlement record, actor, start/end, extension, suspension, and evidence fields do not.
- **Dependencies:** Minimal V1 data policy, issuance authority, validity policy, and private admin record.
- **Entry gate:** The named governing decision is ratified and recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Minimal V1 data policy, issuance authority, validity policy, and private admin record.
- **Commercial hypothesis:** Fees may be selectively waived; this is not a public free tier.
- **Boundary:** Do not add general account infrastructure to solve V1.
- **Stop rule:** Do not add general account infrastructure to solve V1.
- **Source / evidence locator:** Roadmap V1 scope.
- **Next action:** define the smallest manual entitlement record.

### V1-10 — Manual cohort qualification and approval

- **Record class:** Operational process
- **Parent capability:** PC-14 — V1 governing decisions and release boundaries
- **Area / phase / side / type:** Customer operations / V1 / payee / pilot selection
- **Implementation maturity:** Defined or specified
- **Work authorization:** Ready but not queued
- **Purpose:** Recruit people with recent, observable stablecoin-payment behavior rather than random users or founder-created demos.
- **Parent user value:** Pilot users receive one coherent product whose behavior matches its stated boundaries.
- **Parent strategic role:** Prevents implementation from outrunning authority, privacy, or legal decisions.
- **Strategic-role tags:** Governance; Security/assurance; Trust
- **Current implementation:** Qualification criteria and interview questions exist; cohort list, approval record, contact evidence, and consent are absent.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** V1-06/09, behavior-based recruiting, clear pilot offer, and record retention permission.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V1-06/09, behavior-based recruiting, clear pilot offer, and record retention permission.
- **Commercial hypothesis:** Produces meaningful product evidence.
- **Boundary:** Stop broad outreach if candidates do not have an imminent genuine transaction.
- **Stop rule:** Stop broad outreach if candidates do not have an imminent genuine transaction.
- **Source / evidence locator:** Roadmap §§3 and 13.
- **Next action:** assemble the first qualified candidate list after data boundary approval.

### V1-11 — Credential validity and reverification interval

- **Record class:** Governance decision
- **Parent capability:** PC-14 — V1 governing decisions and release boundaries
- **Area / phase / side / type:** Credential policy / V1 / payee / lifecycle decision
- **Implementation maturity:** Defined or specified
- **Work authorization:** Ready but not queued
- **Purpose:** Bound how long wallet-control and route evidence remain current.
- **Parent user value:** Pilot users receive one coherent product whose behavior matches its stated boundaries.
- **Parent strategic role:** Prevents implementation from outrunning authority, privacy, or legal decisions.
- **Strategic-role tags:** Governance; Security/assurance; Trust
- **Current implementation:** Ninety days is the initial hypothesis; actual period, warning window, early reverify trigger, grace, and expired-card behavior are not ratified.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** CC-16/17/39, pilot operating capacity, security rationale, and tested lifecycle copy.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: CC-16/17/39, pilot operating capacity, security rationale, and tested lifecycle copy.
- **Commercial hypothesis:** Maintained value without artificial renewal pressure.
- **Boundary:** Change only with evidence and documented reason.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap V1.
- **Next action:** ratify before first manifest.

### V1-12 — Issuance runbook and rehearsal

- **Record class:** Operational process
- **Parent capability:** PC-15 — V1 pilot operations and incident readiness
- **Area / phase / side / type:** Pilot operations / V1 / payee / runbook
- **Implementation maturity:** Defined or specified
- **Work authorization:** Ready but not queued
- **Purpose:** Make issuance repeatable from approval through wallet proof, signing, publication, independent verification, and retained evidence.
- **Parent user value:** Pilot users receive consistent help and truthful status when normal execution breaks.
- **Parent strategic role:** Makes the pilot an operable service rather than a founder-controlled demo.
- **Strategic-role tags:** Support/operations; Security/assurance; Governance
- **Current implementation:** Tooling and conceptual issuance sequence exist.
- **Remaining work:** Production prerequisites and rehearsal do not.
- **Dependencies:** V1-01/02/06/09/11 and CC-38; complete rehearsal with a non-customer fixture and second-person/evidence verification where possible.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V1-01/02/06/09/11 and CC-38; complete rehearsal with a non-customer fixture and second-person/evidence verification where possible.
- **Commercial hypothesis:** Prevents founder improvisation.
- **Boundary:** No genuine credential before rehearsal passes.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** V1 checklist and signing tooling.
- **Next action:** draft after Gate 1A plan is known.

### V1-13 — Suspension runbook

- **Record class:** Operational process
- **Parent capability:** PC-15 — V1 pilot operations and incident readiness
- **Area / phase / side / type:** Pilot operations / V1 / both / runbook
- **Implementation maturity:** Defined or specified
- **Work authorization:** Ready but not queued
- **Purpose:** Temporarily disable a card with clear authority, evidence, payer copy, customer contact, and restoration criteria.
- **Parent user value:** Pilot users receive consistent help and truthful status when normal execution breaks.
- **Parent strategic role:** Makes the pilot an operable service rather than a founder-controlled demo.
- **Strategic-role tags:** Support/operations; Security/assurance; Governance
- **Current implementation:** Runtime state exists; procedure and rehearsal do not.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** CC-13/18/41, private case record, reason codes, support copy, and live-like drill.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: CC-13/18/41, private case record, reason codes, support copy, and live-like drill.
- **Commercial hypothesis:** Operability gate.
- **Boundary:** Suspension blocks the ImplicitEx route, not customer funds.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** V1 scope and lifecycle contracts.
- **Next action:** author with lifecycle runbook set.

### V1-14 — Revocation runbook

- **Record class:** Operational process
- **Parent capability:** PC-15 — V1 pilot operations and incident readiness
- **Area / phase / side / type:** Pilot operations / V1 / both / runbook
- **Implementation maturity:** Defined or specified
- **Work authorization:** Ready but not queued
- **Purpose:** Permanently disable a route while preserving prior evidence and supporting the cardholder/payer.
- **Parent user value:** Pilot users receive consistent help and truthful status when normal execution breaks.
- **Parent strategic role:** Makes the pilot an operable service rather than a founder-controlled demo.
- **Strategic-role tags:** Support/operations; Security/assurance; Governance
- **Current implementation:** Runtime state exists; authority, proof threshold, notification, record, and rehearsal do not.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** CC-13/19/41, incident policy, public/private reason split, and old-route execution smoke.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: CC-13/19/41, incident policy, public/private reason split, and old-route execution smoke.
- **Commercial hypothesis:** Key maintained-credential value.
- **Boundary:** Never delete history as revocation.
- **Stop rule:** Never delete history as revocation.
- **Source / evidence locator:** V1 scope.
- **Next action:** author with lifecycle runbook set.

### V1-15 — Replacement and supersession runbook

- **Record class:** Operational process
- **Parent capability:** PC-15 — V1 pilot operations and incident readiness
- **Area / phase / side / type:** Pilot operations / V1 / payee / runbook
- **Implementation maturity:** Defined or specified
- **Work authorization:** Ready but not queued
- **Purpose:** Replace wallet or route once while retaining public identity and showing the old version is no longer current.
- **Parent user value:** Pilot users receive consistent help and truthful status when normal execution breaks.
- **Parent strategic role:** Makes the pilot an operable service rather than a founder-controlled demo.
- **Strategic-role tags:** Support/operations; Security/assurance; Governance
- **Current implementation:** Runtime lineage primitives exist.
- **Remaining work:** Operator sequence, new proof, redirects, notice, and rehearsal do not.
- **Dependencies:** CC-20/31/39, new wallet proof, immutable old record, and payer-facing status.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: CC-20/31/39, new wallet proof, immutable old record, and payer-facing status.
- **Commercial hypothesis:** Tests route-lineage value.
- **Boundary:** Do not silently mutate a signed manifest.
- **Stop rule:** Do not silently mutate a signed manifest.
- **Source / evidence locator:** V1 scope and lineage contracts.
- **Next action:** author and drill.

### V1-16 — Compromise response workflow

- **Record class:** Operational process
- **Parent capability:** PC-15 — V1 pilot operations and incident readiness
- **Area / phase / side / type:** Security operations / V1 / both / incident runbook
- **Implementation maturity:** Defined or specified
- **Work authorization:** Ready but not queued
- **Purpose:** Coordinate suspension, revocation, replacement, evidence preservation, communication, and recovery after a suspected compromise.
- **Parent user value:** Pilot users receive consistent help and truthful status when normal execution breaks.
- **Parent strategic role:** Makes the pilot an operable service rather than a founder-controlled demo.
- **Strategic-role tags:** Support/operations; Security/assurance; Governance
- **Current implementation:** General ingredients exist.
- **Remaining work:** Scenario matrix and rehearsed response do not.
- **Dependencies:** CC-40, V1-04/05, incident roles, severity, detection, and rollback.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: CC-40, V1-04/05, incident roles, severity, detection, and rollback.
- **Commercial hypothesis:** Protects the credential service, not customer principal.
- **Boundary:** Never promise recovery of funds.
- **Stop rule:** Never promise recovery of funds.
- **Source / evidence locator:** Roadmap security scope.
- **Next action:** build after lifecycle authority is ratified.

### V1-17 — Support workflow

- **Record class:** Operational process
- **Parent capability:** PC-15 — V1 pilot operations and incident readiness
- **Area / phase / side / type:** Customer operations / V1 / both / service procedure
- **Implementation maturity:** Defined or specified
- **Work authorization:** Ready but not queued
- **Purpose:** Handle issuance questions, route status, wallet confusion, payment state, and evidence requests consistently.
- **Parent user value:** Pilot users receive consistent help and truthful status when normal execution breaks.
- **Parent strategic role:** Makes the pilot an operable service rather than a founder-controlled demo.
- **Strategic-role tags:** Support/operations; Security/assurance; Governance
- **Current implementation:** FAQ, failure copy, and founder knowledge exist.
- **Remaining work:** Pilot intake, identity/control verification for support actions, response templates, escalation, and time tracking do not.
- **Dependencies:** V1 data boundary, lifecycle runbooks, incident escalation, and support evidence log.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V1 data boundary, lifecycle runbooks, incident escalation, and support evidence log.
- **Commercial hypothesis:** Measures whether $9–$49 economics can work.
- **Boundary:** Simplify or raise price if custom support dominates.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap unit economics and V1 checklist.
- **Next action:** define pilot support categories and time capture.

### V1-18 — Uncertain-payment support procedure

- **Record class:** Operational process
- **Parent capability:** PC-15 — V1 pilot operations and incident readiness
- **Area / phase / side / type:** Customer operations / V1 / payer / exception procedure
- **Implementation maturity:** Partially implemented
- **Work authorization:** Ready but not queued
- **Purpose:** Help a user determine what is known, what must be checked, and whether retry is unsafe after an interrupted flow.
- **Parent user value:** Pilot users receive consistent help and truthful status when normal execution breaks.
- **Parent strategic role:** Makes the pilot an operable service rather than a founder-controlled demo.
- **Strategic-role tags:** Support/operations; Security/assurance; Governance
- **Current implementation:** Product states and copy exist; operator investigation steps, evidence request, escalation, and communication are not rehearsed.
- **Remaining work:** Complete the unresolved end-to-end implementation and evidence conditions stated in this record.
- **Dependencies:** FND-15, chain/provider checks, support boundary, and no principal guarantee.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: FND-15, chain/provider checks, support boundary, and no principal guarantee.
- **Commercial hypothesis:** Service value around execution.
- **Boundary:** Never tell a user to retry until prior broadcast is excluded.
- **Stop rule:** Never tell a user to retry until prior broadcast is excluded.
- **Source / evidence locator:** `app-web/frontend/public/js/transfer-status.js`; `docs/testing/transfer-edge-case-rehearsal.md`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** rehearse one submitted-but-unconfirmed scenario.

### V1-19 — Incident, rollback, and customer-communication workflow

- **Record class:** Operational process
- **Parent capability:** PC-15 — V1 pilot operations and incident readiness
- **Area / phase / side / type:** Production operations / V1 / both / incident system
- **Implementation maturity:** Partially implemented
- **Work authorization:** Ready but not queued
- **Purpose:** Detect, contain, roll back, verify, and communicate a production issue without ad hoc decisions.
- **Parent user value:** Pilot users receive consistent help and truthful status when normal execution breaks.
- **Parent strategic role:** Makes the pilot an operable service rather than a founder-controlled demo.
- **Strategic-role tags:** Support/operations; Security/assurance; Governance
- **Current implementation:** Deployment rollback doctrine exists.
- **Remaining work:** Coin Card/registry-specific incident roles, customer template, evidence preservation, and joint rehearsal remain.
- **Dependencies:** GOV-07, V1-04/05/16, contact tree, known-good release, and post-incident verification.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: GOV-07, V1-04/05/16, contact tree, known-good release, and post-incident verification.
- **Commercial hypothesis:** Binding operability gate.
- **Boundary:** Do not activate pilot when rollback or communication authority is unknown.
- **Stop rule:** Do not activate pilot when rollback or communication authority is unknown.
- **Source / evidence locator:** `firebase.json`; `docs/operations/evidence/gate5-public-launch-2026-06-18.md`; branch `docs/product-commercial-roadmap-rev6` at `6bf1608`.
- **Next action:** merge into one V1 incident rehearsal.

### V1-20 — Production security finding register

- **Record class:** Operational process
- **Parent capability:** PC-15 — V1 pilot operations and incident readiness
- **Area / phase / side / type:** Security operations / V1 / internal / evidence system
- **Implementation maturity:** Defined or specified
- **Work authorization:** Ready but not queued
- **Purpose:** Track each finding through severity, exploitability, impact, remediation, regression test, owner, and disposition.
- **Parent user value:** Pilot users receive consistent help and truthful status when normal execution breaks.
- **Parent strategic role:** Makes the pilot an operable service rather than a founder-controlled demo.
- **Strategic-role tags:** Support/operations; Security/assurance; Governance
- **Current implementation:** Many isolated test results exist.
- **Remaining work:** One consolidated V1 finding register does not.
- **Dependencies:** V1-03 review, stable scope, private evidence storage, and closure criteria.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V1-03 review, stable scope, private evidence storage, and closure criteria.
- **Commercial hypothesis:** Binding gate for critical/high findings.
- **Boundary:** “Known” is not the same as “accepted. ”
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap security review schema.
- **Next action:** create as part of V1-03, not before.

### V1-21 — Qualified workflow interviews

- **Record class:** Commercial experiment
- **Parent capability:** PC-16 — V1 customer and commercial evidence
- **Area / phase / side / type:** Customer evidence / V1 / payee-first / research operation
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Establish whether independent operators have the route, matching, evidence, and operating problem before expanding.
- **Parent user value:** The product advances only when it solves a real workflow for genuine users.
- **Parent strategic role:** Replaces founder intuition and sunk cost with explicit continue, narrow, pivot, or stop evidence.
- **Strategic-role tags:** Revenue; Payee operations; Governance
- **Current implementation:** Fifteen payee-side/five payer-side target and interview guide exist.
- **Remaining work:** Completed interview records do not.
- **Dependencies:** Qualified behavior, data consent, separate cohort analysis, last-real-payment reconstruction, and next-action request.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Qualified behavior, data consent, separate cohort analysis, last-real-payment reconstruction, and next-action request.
- **Commercial hypothesis:** At least five of twenty should show repeated pain and commit to a pilot action as working evidence.
- **Boundary:** Otherwise change segment or thesis.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap §13/15.
- **Next action:** begin after V1-06 defines the evidence record.

### V1-22 — Qualified pilot offer and price presentation

- **Record class:** Commercial experiment
- **Parent capability:** PC-16 — V1 customer and commercial evidence
- **Area / phase / side / type:** Commercial evidence / V1 / payee / offer operation
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Test willingness to place and later pay without creating a public free tier or hiding the price hypothesis.
- **Parent user value:** The product advances only when it solves a real workflow for genuine users.
- **Parent strategic role:** Replaces founder intuition and sunk cost with explicit continue, narrow, pivot, or stop evidence.
- **Strategic-role tags:** Revenue; Payee operations; Governance
- **Current implementation:** Price bands and selective waiver doctrine exist.
- **Remaining work:** Exact pilot list price, waiver criteria, included service, and offer script do not.
- **Dependencies:** V1 claim/scope, support boundary, candidate qualification, and price-response logging.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V1 claim/scope, support boundary, candidate qualification, and price-response logging.
- **Commercial hypothesis:** A waiver is an explicit experiment, not “free forever.
- **Boundary:** ” Do not discount to manufacture demand.
- **Stop rule:** ” Do not discount to manufacture demand.
- **Source / evidence locator:** Roadmap §§2 and 9.
- **Next action:** set the V1 offer before outreach.

### V1-23 — Qualified-offer and placement tracking

- **Record class:** Commercial experiment
- **Parent capability:** PC-16 — V1 customer and commercial evidence
- **Area / phase / side / type:** Market evidence / V1 / payee / pilot metric
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Know whether recipients will actually place and share a credential, not merely praise the idea.
- **Parent user value:** The product advances only when it solves a real workflow for genuine users.
- **Parent strategic role:** Replaces founder intuition and sunk cost with explicit continue, narrow, pivot, or stop evidence.
- **Strategic-role tags:** Revenue; Payee operations; Governance
- **Current implementation:** Thresholds are defined.
- **Remaining work:** Prospect-level offer, response, placement, reason, and evidence records do not.
- **Dependencies:** V1-06/10/22, unambiguous qualification, placement definition, and source link.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V1-06/10/22, unambiguous qualification, placement definition, and source link.
- **Commercial hypothesis:** Ten placed cards and five placements from no more than fifty offers are working thresholds.
- **Boundary:** Fewer than five after fifty stops expansion and triggers re-interview.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap V1 gate/kill criterion.
- **Next action:** create the controlled tracker before first offer.

### V1-24 — Genuine third-party payment evidence

- **Record class:** Commercial experiment
- **Parent capability:** PC-16 — V1 customer and commercial evidence
- **Area / phase / side / type:** Customer evidence / V1 / both / adoption metric
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Prove cards participate in real customer-originated payments rather than demos or founder-created traffic.
- **Parent user value:** The product advances only when it solves a real workflow for genuine users.
- **Parent strategic role:** Replaces founder intuition and sunk cost with explicit continue, narrow, pivot, or stop evidence.
- **Strategic-role tags:** Revenue; Payee operations; Governance
- **Current implementation:** Controlled live transfers and demo cards exist, but no evidence in this roadmap cycle shows three distinct pilot cards receiving genuine third-party payments.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** Genuine issued cards, counsel screening decision, production security, consent, chain receipt, and customer context.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Genuine issued cards, counsel screening decision, production security, consent, chain receipt, and customer context.
- **Commercial hypothesis:** At least three cards must receive genuine payments before billing expansion.
- **Boundary:** If placed cards remain demos, investigate the use case.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** V1 gate.
- **Next action:** none until issuance gates pass.

### V1-25 — Pilot evidence repository

- **Record class:** Operational process
- **Parent capability:** PC-16 — V1 customer and commercial evidence
- **Area / phase / side / type:** Evidence operations / V1 / internal / controlled record store
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Keep interviews, offers, placements, payments, failures, support, price response, and decisions traceable.
- **Parent user value:** The product advances only when it solves a real workflow for genuine users.
- **Parent strategic role:** Replaces founder intuition and sunk cost with explicit continue, narrow, pivot, or stop evidence.
- **Strategic-role tags:** Revenue; Payee operations; Governance
- **Current implementation:** Repository evidence conventions and a printable log exist.
- **Remaining work:** Authoritative pilot store, access, naming, retention, and privacy do not.
- **Dependencies:** V1-06, stable record IDs, private/public split, backup, and source links.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V1-06, stable record IDs, private/public split, backup, and source links.
- **Commercial hypothesis:** Converts anecdotes into decision evidence.
- **Boundary:** Do not store excess identity or customer secrets in Git.
- **Stop rule:** Do not store excess identity or customer secrets in Git.
- **Source / evidence locator:** roadmap initial evidence program and V1 checklist.
- **Next action:** choose the minimal private evidence store.

### V1-26 — Evidence-based V1 disposition

- **Record class:** Governance decision
- **Parent capability:** PC-16 — V1 customer and commercial evidence
- **Area / phase / side / type:** Governance / V1 exit / internal / gate decision
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Decide to advance, continue evidence, narrow/change segment, or stop without letting sunk cost decide.
- **Parent user value:** The product advances only when it solves a real workflow for genuine users.
- **Parent strategic role:** Replaces founder intuition and sunk cost with explicit continue, narrow, pivot, or stop evidence.
- **Strategic-role tags:** Revenue; Payee operations; Governance
- **Current implementation:** Binding gates, working thresholds, stop rules, and a signoff worksheet exist.
- **Remaining work:** Actual evidence does not.
- **Dependencies:** All binding security/legal/authority/evidence gates plus reviewed placement, payment, customer, commercial, support, and failure records.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: All binding security/legal/authority/evidence gates plus reviewed placement, payment, customer, commercial, support, and failure records.
- **Commercial hypothesis:** Working thresholds are not statistical proof.
- **Boundary:** Binding failures cannot be averaged away.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap V1 and §15.
- **Next action:** none until evidence program completes.

---

# 5. V2 Gate 0 — account, tenant, data, privacy, and recovery foundation

All Gate 0 records are **Evidence-gated** by a positive V1 disposition. They
are binding prerequisites, not background tasks. No V2 private customer data
may be stored until the applicable records are complete.

### G0-01 — Authentication model

- **Record class:** Control
- **Parent capability:** PC-17 — V2 authentication, tenant, and authorization foundation
- **Area / phase / side / type:** Account platform / V2 Gate 0 / payee / identity control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Give each operator a secure, recoverable workspace identity without weakening wallet self-custody.
- **Parent user value:** An operator can maintain private payment records without exposing another customer's data.
- **Parent strategic role:** Enables paid workspaces without weakening wallet self-custody.
- **Strategic-role tags:** Security/assurance; Governance; Payee operations
- **Current implementation:** Wallet connection exists.
- **Remaining work:** A V2 account identity, credential policy, provider choice, and assurance model do not.
- **Dependencies:** Positive V1 exit, threat model, privacy boundary, provider review, automated auth tests, and controlled recovery rehearsal.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Positive V1 exit, threat model, privacy boundary, provider review, automated auth tests, and controlled recovery rehearsal.
- **Commercial hypothesis:** Enables paid workspaces and private records.
- **Boundary:** Authentication must never imply ImplicitEx controls the payment wallet.
- **Stop rule:** Authentication must never imply ImplicitEx controls the payment wallet.
- **Source / evidence locator:** Roadmap Gate 0.
- **Next action:** none before V1 disposition.

### G0-02 — Account recovery policy and workflow

- **Record class:** Control
- **Parent capability:** PC-17 — V2 authentication, tenant, and authorization foundation
- **Area / phase / side / type:** Account platform / V2 Gate 0 / payee / recovery control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Restore workspace access without an administrator being able to seize a wallet or silently replace a payee.
- **Parent user value:** An operator can maintain private payment records without exposing another customer's data.
- **Parent strategic role:** Enables paid workspaces without weakening wallet self-custody.
- **Strategic-role tags:** Security/assurance; Governance; Payee operations
- **Current implementation:** No V2 account-recovery system exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** G0-01, identity proof policy, recovery delays and notifications, route-change controls, abuse tests, and documented support procedure.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: G0-01, identity proof policy, recovery delays and notifications, route-change controls, abuse tests, and documented support procedure.
- **Commercial hypothesis:** Reduces account-loss support.
- **Boundary:** Stop any design that lets recovery bypass Coin Card route authority.
- **Stop rule:** Stop any design that lets recovery bypass Coin Card route authority.
- **Source / evidence locator:** Roadmap Gate 0 and custody tripwires.
- **Next action:** gated.

### G0-03 — Tenant and workspace model

- **Record class:** Control
- **Parent capability:** PC-17 — V2 authentication, tenant, and authorization foundation
- **Area / phase / side / type:** Data architecture / V2 Gate 0 / payee / authoritative object model
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Define who owns profiles, requests, records, exports, and entitlements before data accumulates.
- **Parent user value:** An operator can maintain private payment records without exposing another customer's data.
- **Parent strategic role:** Enables paid workspaces without weakening wallet self-custody.
- **Strategic-role tags:** Security/assurance; Governance; Payee operations
- **Current implementation:** Shared product objects are proposed; tenant ownership and membership rules are not implemented.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** Object IDs, account model, lifecycle rules, migration plan, schema tests, and explicit ownership invariants.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Object IDs, account model, lifecycle rules, migration plan, schema tests, and explicit ownership invariants.
- **Commercial hypothesis:** Supports individual workspaces first.
- **Boundary:** Do not smuggle team/enterprise complexity into the initial tenant.
- **Stop rule:** Do not smuggle team/enterprise complexity into the initial tenant.
- **Source / evidence locator:** Portal object doctrine and Gate 0.
- **Next action:** gated.

### G0-04 — Tenant isolation

- **Record class:** Control
- **Parent capability:** PC-17 — V2 authentication, tenant, and authorization foundation
- **Area / phase / side / type:** Security / V2 Gate 0 / payee / access boundary
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Prevent one customer from reading, changing, exporting, or inferring another customer's private records.
- **Parent user value:** An operator can maintain private payment records without exposing another customer's data.
- **Parent strategic role:** Enables paid workspaces without weakening wallet self-custody.
- **Strategic-role tags:** Security/assurance; Governance; Payee operations
- **Current implementation:** No V2 multitenant store exists.
- **Remaining work:** Isolation policy, enforcement, negative tests, and review remain.
- **Dependencies:** G0-03, server-side enforcement, hostile cross-tenant test suite, logs, and security signoff.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: G0-03, server-side enforcement, hostile cross-tenant test suite, logs, and security signoff.
- **Commercial hypothesis:** A binding release gate.
- **Boundary:** Any unresolved cross-tenant path blocks V2 deployment.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap Gate 0.
- **Next action:** gated.

### G0-05 — Object-level authorization

- **Record class:** Control
- **Parent capability:** PC-17 — V2 authentication, tenant, and authorization foundation
- **Area / phase / side / type:** Security / V2 Gate 0 / payee / authorization control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Apply ownership and permitted actions to every private profile, request, receipt, contact, export, and setting.
- **Parent user value:** An operator can maintain private payment records without exposing another customer's data.
- **Parent strategic role:** Enables paid workspaces without weakening wallet self-custody.
- **Strategic-role tags:** Security/assurance; Governance; Payee operations
- **Current implementation:** Public Coin Card validation exists.
- **Remaining work:** Private V2 authorization rules and enforcement do not.
- **Dependencies:** Tenant model, action matrix, centralized policy, denial tests for every object and mutation, and audit.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Tenant model, action matrix, centralized policy, denial tests for every object and mutation, and audit.
- **Commercial hypothesis:** Prevents insecure direct-object access.
- **Boundary:** Front-end hiding never counts as authorization.
- **Stop rule:** Front-end hiding never counts as authorization.
- **Source / evidence locator:** Roadmap Gate 0.
- **Next action:** gated.

### G0-06 — Administrative access controls

- **Record class:** Control
- **Parent capability:** PC-17 — V2 authentication, tenant, and authorization foundation
- **Area / phase / side / type:** Security operations / V2 Gate 0 / internal / privileged-access control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Bound founder/support access to customer records and make every exceptional action reviewable.
- **Parent user value:** An operator can maintain private payment records without exposing another customer's data.
- **Parent strategic role:** Enables paid workspaces without weakening wallet self-custody.
- **Strategic-role tags:** Security/assurance; Governance; Payee operations
- **Current implementation:** General MFA doctrine exists.
- **Remaining work:** Role separation, just-in-time access, emergency procedure, and privileged-action log do not.
- **Dependencies:** Admin inventory, least privilege, MFA, access review, break-glass rehearsal, and immutable logs.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Admin inventory, least privilege, MFA, access review, break-glass rehearsal, and immutable logs.
- **Commercial hypothesis:** Necessary for trust and privacy.
- **Boundary:** No shared admin credentials or undocumented record edits.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Gate 0 and operating doctrine.
- **Next action:** gated.

### G0-07 — Session security

- **Record class:** Control
- **Parent capability:** PC-17 — V2 authentication, tenant, and authorization foundation
- **Area / phase / side / type:** Account security / V2 Gate 0 / payee / session control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Keep authenticated workspace sessions from becoming a route or data takeover path.
- **Parent user value:** An operator can maintain private payment records without exposing another customer's data.
- **Parent strategic role:** Enables paid workspaces without weakening wallet self-custody.
- **Strategic-role tags:** Security/assurance; Governance; Payee operations
- **Current implementation:** Wallet-session controls exist.
- **Remaining work:** Account-session expiry, revocation, device awareness, CSRF protection, and tests do not.
- **Dependencies:** Auth provider, cookie/token model, secure defaults, revocation tests, and security review.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Auth provider, cookie/token model, secure defaults, revocation tests, and security review.
- **Commercial hypothesis:** Protects paid workspace use.
- **Boundary:** A workspace session must not silently authorize wallet transactions.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap Gate 0.
- **Next action:** gated.

### G0-08 — Audit logging

- **Record class:** Control
- **Parent capability:** PC-17 — V2 authentication, tenant, and authorization foundation
- **Area / phase / side / type:** Evidence/security / V2 Gate 0 / internal and payee / immutable event record
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Explain who changed sensitive data, entitlements, routes, requests, and administrative state.
- **Parent user value:** An operator can maintain private payment records without exposing another customer's data.
- **Parent strategic role:** Enables paid workspaces without weakening wallet self-custody.
- **Strategic-role tags:** Security/assurance; Governance; Payee operations
- **Current implementation:** Coin Card build/evidence logs exist.
- **Remaining work:** A private tenant/admin audit stream, retention, access, and export do not.
- **Dependencies:** Stable actor/object IDs, event taxonomy, tamper controls, privacy review, and incident replay test.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Stable actor/object IDs, event taxonomy, tamper controls, privacy review, and incident replay test.
- **Commercial hypothesis:** Supports disputes and support without claiming insurance.
- **Boundary:** Do not log secrets or unnecessary PII.
- **Stop rule:** Do not log secrets or unnecessary PII.
- **Source / evidence locator:** Roadmap Gate 0.
- **Next action:** gated.

### G0-09 — Data classification

- **Record class:** Control
- **Parent capability:** PC-18 — V2 data, privacy, backup, and recovery foundation
- **Area / phase / side / type:** Privacy/security / V2 Gate 0 / internal / governance control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Classify public registry data, private business data, personal data, financial metadata, secrets, and evidence.
- **Parent user value:** Customers understand and control eligible data while their operational records remain durable.
- **Parent strategic role:** Preserves the lightweight trust position as ImplicitEx becomes an account platform.
- **Strategic-role tags:** Security/assurance; Governance; Support/operations
- **Current implementation:** V1 minimal-data decision is pending.
- **Remaining work:** The V2 classification matrix and handling rules do not exist.
- **Dependencies:** V1-06, object inventory, storage-flow diagram, owners, handling controls, and review.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V1-06, object inventory, storage-flow diagram, owners, handling controls, and review.
- **Commercial hypothesis:** Enables proportionate security and honest disclosures.
- **Boundary:** Unclassified data cannot enter production.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap Gate 0 and PII posture.
- **Next action:** gated.

### G0-10 — PII minimization

- **Record class:** Control
- **Parent capability:** PC-18 — V2 data, privacy, backup, and recovery foundation
- **Area / phase / side / type:** Privacy / V2 Gate 0 / payee / collection boundary
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Collect only identity/contact data required for the selected paid workflow.
- **Parent user value:** Customers understand and control eligible data while their operational records remain durable.
- **Parent strategic role:** Preserves the lightweight trust position as ImplicitEx becomes an account platform.
- **Strategic-role tags:** Security/assurance; Governance; Support/operations
- **Current implementation:** Current portal is mostly local/stateless.
- **Remaining work:** V2 field justification, optionality, redaction, and analytics boundaries remain.
- **Dependencies:** G0-09, purpose inventory, field-by-field necessity review, form tests, and privacy disclosure.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: G0-09, purpose inventory, field-by-field necessity review, form tests, and privacy disclosure.
- **Commercial hypothesis:** Preserves the lightweight trust position.
- **Boundary:** “May be useful later” is not a collection purpose.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap open PII decision.
- **Next action:** gated.

### G0-11 — Retention and deletion policy

- **Record class:** Control
- **Parent capability:** PC-18 — V2 data, privacy, backup, and recovery foundation
- **Area / phase / side / type:** Privacy operations / V2 Gate 0 / payee / lifecycle control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Define how long every private record, log, backup, and support artifact remains and when it is destroyed.
- **Parent user value:** Customers understand and control eligible data while their operational records remain durable.
- **Parent strategic role:** Preserves the lightweight trust position as ImplicitEx becomes an account platform.
- **Strategic-role tags:** Security/assurance; Governance; Support/operations
- **Current implementation:** No V2 retention schedule or deletion execution exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Classification, legal needs, evidence requirements, backup behavior, automated expiry, and test deletion.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Classification, legal needs, evidence requirements, backup behavior, automated expiry, and test deletion.
- **Commercial hypothesis:** Avoids indefinite liability while preserving promised evidence.
- **Boundary:** Public chain data cannot be deleted; copy must say so.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap Gate 0.
- **Next action:** gated.

### G0-12 — Customer data deletion

- **Record class:** Control
- **Parent capability:** PC-18 — V2 data, privacy, backup, and recovery foundation
- **Area / phase / side / type:** Account operations / V2 Gate 0 / payee / customer control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Let a customer close the workspace and remove deletable private data predictably.
- **Parent user value:** Customers understand and control eligible data while their operational records remain durable.
- **Parent strategic role:** Preserves the lightweight trust position as ImplicitEx becomes an account platform.
- **Strategic-role tags:** Security/assurance; Governance; Support/operations
- **Current implementation:** No account-deletion workflow exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** G0-11, identity confirmation, grace/recovery policy, downstream deletion, backup handling, and end-to-end test.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: G0-11, identity confirmation, grace/recovery policy, downstream deletion, backup handling, and end-to-end test.
- **Commercial hypothesis:** Required before collecting account data.
- **Boundary:** Never promise deletion of blockchain records or required evidence.
- **Stop rule:** Never promise deletion of blockchain records or required evidence.
- **Source / evidence locator:** Roadmap Gate 0.
- **Next action:** gated.

### G0-13 — Customer data export

- **Record class:** Control
- **Parent capability:** PC-18 — V2 data, privacy, backup, and recovery foundation
- **Area / phase / side / type:** Data portability / V2 Gate 0 / payee / customer control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Keep the focused challenger portable and reduce lock-in fears.
- **Parent user value:** Customers understand and control eligible data while their operational records remain durable.
- **Parent strategic role:** Preserves the lightweight trust position as ImplicitEx becomes an account platform.
- **Strategic-role tags:** Security/assurance; Governance; Support/operations
- **Current implementation:** Local receipt exports exist.
- **Remaining work:** Complete workspace export schema, access controls, delivery, and tests do not.
- **Dependencies:** Object schemas, authorization, safe archive construction, audit event, and sample importable output.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Object schemas, authorization, safe archive construction, audit event, and sample importable output.
- **Commercial hypothesis:** Supports self-custodial/provider-neutral positioning.
- **Boundary:** Export must not leak another tenant's data.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap Gate 0.
- **Next action:** gated.

### G0-14 — Backup system

- **Record class:** Control
- **Parent capability:** PC-18 — V2 data, privacy, backup, and recovery foundation
- **Area / phase / side / type:** Reliability / V2 Gate 0 / internal / resilience control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Preserve private operational records against service or operator failure.
- **Parent user value:** Customers understand and control eligible data while their operational records remain durable.
- **Parent strategic role:** Preserves the lightweight trust position as ImplicitEx becomes an account platform.
- **Strategic-role tags:** Security/assurance; Governance; Support/operations
- **Current implementation:** Repository artifacts are versioned.
- **Remaining work:** No V2 production-data backup architecture exists.
- **Dependencies:** Data map, encrypted storage, key/access policy, retention, monitoring, and successful scheduled backups.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Data map, encrypted storage, key/access policy, retention, monitoring, and successful scheduled backups.
- **Commercial hypothesis:** Supports durable records.
- **Boundary:** A backup claim without a restoration test is not complete.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap Gate 0.
- **Next action:** gated.

### G0-15 — Recovery testing

- **Record class:** Control
- **Parent capability:** PC-18 — V2 data, privacy, backup, and recovery foundation
- **Area / phase / side / type:** Reliability / V2 Gate 0 / internal / operational proof
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Prove customer records and service can be restored within defined objectives.
- **Parent user value:** Customers understand and control eligible data while their operational records remain durable.
- **Parent strategic role:** Preserves the lightweight trust position as ImplicitEx becomes an account platform.
- **Strategic-role tags:** Security/assurance; Governance; Support/operations
- **Current implementation:** No V2 data-recovery exercise exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** G0-14, recovery objectives, isolated rehearsal, integrity comparison, timing, defects, and signoff.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: G0-14, recovery objectives, isolated rehearsal, integrity comparison, timing, defects, and signoff.
- **Commercial hypothesis:** Protects the promise of preserved records.
- **Boundary:** Failed or untested recovery blocks launch.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap Gate 0.
- **Next action:** gated.

### G0-16 — Account-platform incident response

- **Record class:** Control
- **Parent capability:** PC-18 — V2 data, privacy, backup, and recovery foundation
- **Area / phase / side / type:** Security operations / V2 Gate 0 / internal / response system
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Detect, contain, investigate, notify, recover, and learn from account or data incidents.
- **Parent user value:** Customers understand and control eligible data while their operational records remain durable.
- **Parent strategic role:** Preserves the lightweight trust position as ImplicitEx becomes an account platform.
- **Strategic-role tags:** Security/assurance; Governance; Support/operations
- **Current implementation:** Release rollback doctrine exists.
- **Remaining work:** V2 account/data incident severity, contacts, evidence, customer notice, and drills do not.
- **Dependencies:** Threat model, logs, admin controls, backup, communication templates, tabletop, and corrective actions.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Threat model, logs, admin controls, backup, communication templates, tabletop, and corrective actions.
- **Commercial hypothesis:** Required before private data launch.
- **Boundary:** Do not imply principal-loss reimbursement.
- **Stop rule:** Do not imply principal-loss reimbursement.
- **Source / evidence locator:** Roadmap Gate 0 and operating doctrine.
- **Next action:** gated.

### G0-17 — Billing-data separation

- **Record class:** Control
- **Parent capability:** PC-18 — V2 data, privacy, backup, and recovery foundation
- **Area / phase / side / type:** Billing/security / V2 Gate 0 / payee / integration boundary
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Keep payment-card and regulated billing data with the billing provider while storing only required entitlements.
- **Parent user value:** Customers understand and control eligible data while their operational records remain durable.
- **Parent strategic role:** Preserves the lightweight trust position as ImplicitEx becomes an account platform.
- **Strategic-role tags:** Security/assurance; Governance; Support/operations
- **Current implementation:** No V2 billing integration exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Provider selection, data-flow map, signed webhooks, minimal customer IDs, deletion rules, and tests.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Provider selection, data-flow map, signed webhooks, minimal customer IDs, deletion rules, and tests.
- **Commercial hypothesis:** Enables subscriptions without becoming a card-data custodian.
- **Boundary:** Never store raw card credentials.
- **Stop rule:** Never store raw card credentials.
- **Source / evidence locator:** V2 Core pricing and Gate 0.
- **Next action:** gated.

### G0-18 — Public-registry/private-record separation

- **Record class:** Control
- **Parent capability:** PC-18 — V2 data, privacy, backup, and recovery foundation
- **Area / phase / side / type:** Data architecture / V2 Gate 0 / payee and public / trust boundary
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Keep independently verifiable Coin Card facts public while protecting customer operations, contacts, and notes.
- **Parent user value:** Customers understand and control eligible data while their operational records remain durable.
- **Parent strategic role:** Preserves the lightweight trust position as ImplicitEx becomes an account platform.
- **Strategic-role tags:** Security/assurance; Governance; Support/operations
- **Current implementation:** Public static artifacts exist.
- **Remaining work:** The V2 split, cross-links, cache rules, and access tests do not.
- **Dependencies:** Classification, object model, public schema, private store, authorization, and privacy review.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Classification, object model, public schema, private store, authorization, and privacy review.
- **Commercial hypothesis:** Preserves portable evidence without publishing business records.
- **Boundary:** Public objects must not contain hidden PII.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap Gate 0 and signed-record architecture.
- **Next action:** gated.

### G0-19 — Privacy disclosure and consent surfaces

- **Record class:** Control
- **Parent capability:** PC-18 — V2 data, privacy, backup, and recovery foundation
- **Area / phase / side / type:** Legal/product / V2 Gate 0 / payee / release control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Make collection, use, retention, analytics, exports, and deletion understandable at the point they occur.
- **Parent user value:** Customers understand and control eligible data while their operational records remain durable.
- **Parent strategic role:** Preserves the lightweight trust position as ImplicitEx becomes an account platform.
- **Strategic-role tags:** Security/assurance; Governance; Support/operations
- **Current implementation:** Public legal copy exists for the present portal.
- **Remaining work:** V2-specific disclosure, consent, versioning, and tests do not.
- **Dependencies:** Completed data map, counsel review where required, versioned copy, UI alignment, and release checklist.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Completed data map, counsel review where required, versioned copy, UI alignment, and release checklist.
- **Commercial hypothesis:** Honest disclosure supports trust but does not legalize unnecessary collection.
- **Boundary:** The record remains within the governing self-custody, data, security, and scope boundaries.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Legal Development Hierarchy and Gate 0.
- **Next action:** gated.

---

# 6. V2 Core — paid credential and payment operations

V2 Core may begin only after a positive V1 disposition and completed Gate 0.
It delivers one coherent workflow: create request → share → submit → verify →
match → preserve evidence → search/export.

### V2C-01 — Billing and entitlement

- **Record class:** Operational process
- **Parent capability:** PC-19 — Billing, entitlement, onboarding, and unit economics
- **Area / phase / side / type:** Commercial platform / V2 Core / payee / paid entitlement
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Charge the operator receiving the ongoing workspace value rather than taxing a sender for commodity movement.
- **Parent user value:** The operator can buy the service they receive without an unexplained sender toll.
- **Parent strategic role:** Tests the focused-challenger business model independently of the deployed 1% fee.
- **Strategic-role tags:** Revenue; Support/operations; Payee operations
- **Current implementation:** Pricing bands exist; provider, product, checkout, entitlement state, invoices, tax posture, and integration do not.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** Positive V1 paid signal, Gate 0, G0-17, signed webhooks, reconciliation, cancellation, and live controlled billing evidence.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Positive V1 paid signal, Gate 0, G0-17, signed webhooks, reconciliation, cancellation, and live controlled billing evidence.
- **Commercial hypothesis:** Test Individual $9–$19 and Small Operator $25–$49 bands; do not invent features to defend the deployed 1%.
- **Boundary:** The record remains within the governing self-custody, data, security, and scope boundaries.
- **Stop rule:** Test Individual $9–$19 and Small Operator $25–$49 bands; do not invent features to defend the deployed 1%.
- **Source / evidence locator:** Roadmap pricing doctrine.
- **Next action:** gated.

### V2C-02 — Signed billing webhooks and idempotent entitlement changes

- **Record class:** Operational process
- **Parent capability:** PC-19 — Billing, entitlement, onboarding, and unit economics
- **Area / phase / side / type:** Billing/security / V2 Core / payee / integration control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Keep access synchronized with verified provider events without duplicate grants or attacker-created entitlements.
- **Parent user value:** The operator can buy the service they receive without an unexplained sender toll.
- **Parent strategic role:** Tests the focused-challenger business model independently of the deployed 1% fee.
- **Strategic-role tags:** Revenue; Support/operations; Payee operations
- **Current implementation:** No billing webhook implementation exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** V2C-01, signature validation, replay defense, idempotency keys, event store, retry handling, and hostile tests.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2C-01, signature validation, replay defense, idempotency keys, event store, retry handling, and hostile tests.
- **Commercial hypothesis:** Prevents revenue leakage and wrongful access.
- **Boundary:** Client-supplied “paid” state is never authoritative.
- **Stop rule:** Client-supplied “paid” state is never authoritative.
- **Source / evidence locator:** Roadmap V2 Core.
- **Next action:** gated.

### V2C-03 — Billing grace, cancellation, and downgrade handling

- **Record class:** Operational process
- **Parent capability:** PC-19 — Billing, entitlement, onboarding, and unit economics
- **Area / phase / side / type:** Commercial operations / V2 Core / payee / lifecycle workflow
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Make failed payments and cancellation predictable without deleting evidence or trapping customers.
- **Parent user value:** The operator can buy the service they receive without an unexplained sender toll.
- **Parent strategic role:** Tests the focused-challenger business model independently of the deployed 1% fee.
- **Strategic-role tags:** Revenue; Support/operations; Payee operations
- **Current implementation:** Policy and implementation do not exist.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Entitlement state machine, notice copy, grace rules, read/export access, deletion policy, and scenario tests.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Entitlement state machine, notice copy, grace rules, read/export access, deletion policy, and scenario tests.
- **Commercial hypothesis:** Preserves support margin and trust.
- **Boundary:** Downgrade must not corrupt public credential history.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap V2 Core.
- **Next action:** gated.

### V2C-04 — Fixed-amount signed payment request

- **Record class:** Capability
- **Parent capability:** PC-20 — Signed payment requests and frozen execution intent
- **Area / phase / side / type:** Payment requests / V2 Core / payee / core product
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Turn a wallet destination plus a separately messaged amount into one authenticated payment instruction.
- **Parent user value:** A payer receives one coherent instruction instead of separate address and amount messages.
- **Parent strategic role:** Creates the core request layer above commodity stablecoin movement.
- **Strategic-role tags:** Payee operations; Payer usability; Trust; Execution
- **Current implementation:** Coin Card trust primitives exist.
- **Remaining work:** Request schema, signer, UI, verifier, storage, and execution binding do not.
- **Dependencies:** Signed-record constitution, Gate 0, Coin Card authority, test vectors, independent verification, and genuine request-launched payment.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Signed-record constitution, Gate 0, Coin Card authority, test vectors, independent verification, and genuine request-launched payment.
- **Commercial hypothesis:** Central value for independent operators.
- **Boundary:** Do not call it unique; win on simplicity, self-custody, and evidence.
- **Stop rule:** Do not call it unique; win on simplicity, self-custody, and evidence.
- **Source / evidence locator:** Roadmap V2 Core and capability register.
- **Next action:** gated.

### V2C-05 — Request expiration

- **Record class:** Capability
- **Parent capability:** PC-20 — Signed payment requests and frozen execution intent
- **Area / phase / side / type:** Payment requests / V2 Core / both / lifecycle control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Prevent stale terms from remaining executable and make due-time expectations explicit.
- **Parent user value:** A payer receives one coherent instruction instead of separate address and amount messages.
- **Parent strategic role:** Creates the core request layer above commodity stablecoin movement.
- **Strategic-role tags:** Payee operations; Payer usability; Trust; Execution
- **Current implementation:** Coin Card temporal primitives exist.
- **Remaining work:** Request expiry semantics and UI do not.
- **Dependencies:** V2C-04, authoritative time, boundary test vectors, fail-closed UI, and evidence preservation.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2C-04, authoritative time, boundary test vectors, fail-closed UI, and evidence preservation.
- **Commercial hypothesis:** Reduces ambiguity; expiry never erases the historical request.
- **Boundary:** The record remains within the governing self-custody, data, security, and scope boundaries.
- **Stop rule:** Reduces ambiguity; expiry never erases the historical request.
- **Source / evidence locator:** Signed-request specification.
- **Next action:** gated.

### V2C-06 — Request ID, nonce, and replay rules

- **Record class:** Capability
- **Parent capability:** PC-20 — Signed payment requests and frozen execution intent
- **Area / phase / side / type:** Payment requests/security / V2 Core / both / identity control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Give every obligation a durable identity and prevent a signed instruction from being reused outside its rules.
- **Parent user value:** A payer receives one coherent instruction instead of separate address and amount messages.
- **Parent strategic role:** Creates the core request layer above commodity stablecoin movement.
- **Strategic-role tags:** Payee operations; Payer usability; Trust; Execution
- **Current implementation:** Coin Card replay rules exist.
- **Remaining work:** Request IDs, uniqueness, consumption semantics, and tests do not.
- **Dependencies:** V2C-04, canonical schema, collision policy, one-shot/reusable decision, and replay suite.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2C-04, canonical schema, collision policy, one-shot/reusable decision, and replay suite.
- **Commercial hypothesis:** Enables reliable matching and duplicate warnings.
- **Boundary:** No amount-plus-address surrogate IDs.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap matching model.
- **Next action:** gated.

### V2C-07 — Canonical atomic amounts and signed payment terms

- **Record class:** Capability
- **Parent capability:** PC-20 — Signed payment requests and frozen execution intent
- **Area / phase / side / type:** Payment requests / V2 Core / both / integrity control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Ensure the payer sees and authorizes the exact asset, chain, recipient, amount, fee policy, purpose, and expiry.
- **Parent user value:** A payer receives one coherent instruction instead of separate address and amount messages.
- **Parent strategic role:** Creates the core request layer above commodity stablecoin movement.
- **Strategic-role tags:** Payee operations; Payer usability; Trust; Execution
- **Current implementation:** Transfer atomic amount validation exists.
- **Remaining work:** Request canonicalization, domain separation, and cross-runtime vectors do not.
- **Dependencies:** V2C-04, asset registry, serialization rules, mutation tests, and display-contract parity.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2C-04, asset registry, serialization rules, mutation tests, and display-contract parity.
- **Commercial hypothesis:** Makes the request evidence useful.
- **Boundary:** Any change to bound terms invalidates the signature.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Signed-record architecture.
- **Next action:** gated.

### V2C-08 — Purpose and reference fields

- **Record class:** Capability
- **Parent capability:** PC-20 — Signed payment requests and frozen execution intent
- **Area / phase / side / type:** Payment administration / V2 Core / payee / business-context feature
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Convert a raw transfer into a named obligation that can be found and explained later.
- **Parent user value:** A payer receives one coherent instruction instead of separate address and amount messages.
- **Parent strategic role:** Creates the core request layer above commodity stablecoin movement.
- **Strategic-role tags:** Payee operations; Payer usability; Trust; Execution
- **Current implementation:** Local memos exist in present transfer records.
- **Remaining work:** Signed request purpose/reference schema and privacy controls do not.
- **Dependencies:** V2C-04/07, length/character constraints, private/public decision, display/export tests.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2C-04/07, length/character constraints, private/public decision, display/export tests.
- **Commercial hypothesis:** Core “record it” value.
- **Boundary:** Warn if any field will become public or immutable.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap product thesis.
- **Next action:** gated.

### V2C-09 — Request lifecycle

- **Record class:** Capability
- **Parent capability:** PC-20 — Signed payment requests and frozen execution intent
- **Area / phase / side / type:** Payment requests / V2 Core / payee / state machine
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Represent draft, open, viewed, paid, expired, cancelled, failed, unmatched, and uncertain states consistently.
- **Parent user value:** A payer receives one coherent instruction instead of separate address and amount messages.
- **Parent strategic role:** Creates the core request layer above commodity stablecoin movement.
- **Strategic-role tags:** Payee operations; Payer usability; Trust; Execution
- **Current implementation:** Coin Card lifecycle patterns exist.
- **Remaining work:** Request state authority, transitions, UI, concurrency, and tests do not.
- **Dependencies:** Stable request IDs, watcher, matching model, cancellation authority, transition matrix, and event replay.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Stable request IDs, watcher, matching model, cancellation authority, transition matrix, and event replay.
- **Commercial hypothesis:** Gives operators an actionable inbox.
- **Boundary:** Never infer paid solely from a browser redirect.
- **Stop rule:** Never infer paid solely from a browser redirect.
- **Source / evidence locator:** Roadmap V2 Core.
- **Next action:** gated.

### V2C-10 — Authenticated share link and safe URL handling

- **Record class:** Capability
- **Parent capability:** PC-20 — Signed payment requests and frozen execution intent
- **Area / phase / side / type:** Distribution/security / V2 Core / both / request delivery
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Let a client open the intended request without trusting separately copied address, amount, and purpose.
- **Parent user value:** A payer receives one coherent instruction instead of separate address and amount messages.
- **Parent strategic role:** Creates the core request layer above commodity stablecoin movement.
- **Strategic-role tags:** Payee operations; Payer usability; Trust; Execution
- **Current implementation:** Coin Card routes and handoff exist.
- **Remaining work:** Request URL schema, signature envelope, parsing limits, tamper rejection, and tests do not.
- **Dependencies:** V2C-04/07, HTTPS, canonical parser, size limits, unknown-field behavior, and malicious URL suite.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2C-04/07, HTTPS, canonical parser, size limits, unknown-field behavior, and malicious URL suite.
- **Commercial hypothesis:** Reduces coordination work.
- **Boundary:** A link is a carrier, not authority; signature verification remains mandatory.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap V2 Core and ERC-681 analysis.
- **Next action:** gated.

### V2C-11 — ERC-681 wallet handoff

- **Record class:** Capability
- **Parent capability:** PC-20 — Signed payment requests and frozen execution intent
- **Area / phase / side / type:** Interoperability / V2 Core / payer / wallet launch mechanism
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Use a standard wallet request format while ImplicitEx supplies authentication, lifecycle, and evidence.
- **Parent user value:** A payer receives one coherent instruction instead of separate address and amount messages.
- **Parent strategic role:** Creates the core request layer above commodity stablecoin movement.
- **Strategic-role tags:** Payee operations; Payer usability; Trust; Execution
- **Current implementation:** Wallet dispatch exists.
- **Remaining work:** Request-to-ERC-681 mapping, wallet compatibility matrix, amount-change detection, and fallback do not.
- **Dependencies:** V2C-10, supported-wallet tests, exact post-return validation, and no silent term mutation.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2C-10, supported-wallet tests, exact post-return validation, and no silent term mutation.
- **Commercial hypothesis:** Avoids proprietary wallet lock-in.
- **Boundary:** ERC-681 itself does not prove intent integrity.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** ERC-681 and roadmap competitive teardown.
- **Next action:** gated.

### V2C-12 — Frozen execution intent

- **Record class:** Capability
- **Parent capability:** PC-20 — Signed payment requests and frozen execution intent
- **Area / phase / side / type:** Execution/security / V2 Core / payer / authorization boundary
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Freeze request ID, route version, exact terms, wallet/account/chain context, and expiry before dispatch.
- **Parent user value:** A payer receives one coherent instruction instead of separate address and amount messages.
- **Parent strategic role:** Creates the core request layer above commodity stablecoin movement.
- **Strategic-role tags:** Payee operations; Payer usability; Trust; Execution
- **Current implementation:** Coin Card execution snapshots exist.
- **Remaining work:** Request-aware execution intent, storage, return validation, and tests do not.
- **Dependencies:** V2C-04/07/09, Coin Card executable route, provider continuity, and mutation/TOCTOU suites.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2C-04/07/09, Coin Card executable route, provider continuity, and mutation/TOCTOU suites.
- **Commercial hypothesis:** Connects “requested” to “authorized.
- **Boundary:** ” Any material drift fails closed and requires a new review.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Matching architecture and Coin Card contract.
- **Next action:** gated.

### V2C-13 — Transaction-hash capture and submission binding

- **Record class:** Capability
- **Parent capability:** PC-20 — Signed payment requests and frozen execution intent
- **Area / phase / side / type:** Matching/evidence / V2 Core / both / capture control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Bind a request-launched submission to its transaction before confirmation.
- **Parent user value:** A payer receives one coherent instruction instead of separate address and amount messages.
- **Parent strategic role:** Creates the core request layer above commodity stablecoin movement.
- **Strategic-role tags:** Payee operations; Payer usability; Trust; Execution
- **Current implementation:** Present portal captures hashes for local receipts.
- **Remaining work:** Authoritative server-side request/hash relation and disrupted-handoff handling do not.
- **Dependencies:** V2C-12, authenticated write, idempotency, wallet/browser failure tests, and immutable event record.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2C-12, authenticated write, idempotency, wallet/browser failure tests, and immutable event record.
- **Commercial hypothesis:** Enables authoritative matching.
- **Boundary:** If capture fails, label the relationship uncertain rather than guessing.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap authoritative matching model.
- **Next action:** gated.

### V2C-14 — Minimal confirmation watcher

- **Record class:** Component
- **Parent capability:** PC-21 — Authoritative matching, watcher, and reconciliation
- **Area / phase / side / type:** Chain operations / V2 Core / both / event service
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Confirm known submitted transactions without prematurely building a general chain indexer.
- **Parent user value:** The operator knows which obligation was actually paid and which cases require review.
- **Parent strategic role:** Transforms raw chain transfers into evidence-derived payment operations.
- **Strategic-role tags:** Evidence; Payee operations; Security/assurance
- **Current implementation:** Browser confirmation monitoring exists.
- **Remaining work:** Durable backend queue, RPC redundancy, retry, finality, and alerting do not.
- **Dependencies:** V2C-13, chain/RPC policy, idempotent jobs, restart recovery, production monitoring, and chaos tests.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2C-13, chain/RPC policy, idempotent jobs, restart recovery, production monitoring, and chaos tests.
- **Commercial hypothesis:** Powers status and evidence.
- **Boundary:** Remain narrow until external-transfer recovery or webhooks prove an indexer is needed.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap V2 matching architecture.
- **Next action:** gated.

### V2C-15 — Verified transaction receipt and event validation

- **Record class:** Component
- **Parent capability:** PC-21 — Authoritative matching, watcher, and reconciliation
- **Area / phase / side / type:** Matching/security / V2 Core / both / authoritative verifier
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Prove that the captured transaction settled through the expected contract with the signed terms.
- **Parent user value:** The operator knows which obligation was actually paid and which cases require review.
- **Parent strategic role:** Transforms raw chain transfers into evidence-derived payment operations.
- **Strategic-role tags:** Evidence; Payee operations; Security/assurance
- **Current implementation:** Portal validates live transaction outcomes locally.
- **Remaining work:** Watcher-side verification and durable results do not.
- **Dependencies:** V2C-14, ABI/version registry, and tests for sender, recipient, asset contract, chain, atomic amount, fee, transfer contract, success status, and emitted event.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2C-14, ABI/version registry, and tests for sender, recipient, asset contract, chain, atomic amount, fee, transfer contract, success status, and emitted event.
- **Commercial hypothesis:** Core evidence value.
- **Boundary:** A hash or wallet success message alone is insufficient.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap matching model and transfer evidence contract.
- **Next action:** gated.

### V2C-16 — Reorganization and finality handling

- **Record class:** Component
- **Parent capability:** PC-21 — Authoritative matching, watcher, and reconciliation
- **Area / phase / side / type:** Chain reliability / V2 Core / both / settlement state control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Keep “paid” status accurate when chain observations change before finality.
- **Parent user value:** The operator knows which obligation was actually paid and which cases require review.
- **Parent strategic role:** Transforms raw chain transfers into evidence-derived payment operations.
- **Strategic-role tags:** Evidence; Payee operations; Security/assurance
- **Current implementation:** Confirmation-depth logic exists in the portal.
- **Remaining work:** Durable watcher reorg detection and status repair do not.
- **Dependencies:** V2C-14/15, finality policy, block/hash tracking, reversal tests, notices, and evidence versioning.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2C-14/15, finality policy, block/hash tracking, reversal tests, notices, and evidence versioning.
- **Commercial hypothesis:** Prevents false certainty.
- **Boundary:** Distinguish submitted, observed, confirmed, and final.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Existing transaction-state contract.
- **Next action:** gated.

### V2C-17 — Idempotent event processing

- **Record class:** Component
- **Parent capability:** PC-21 — Authoritative matching, watcher, and reconciliation
- **Area / phase / side / type:** Reliability / V2 Core / internal / processing control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Prevent retries, duplicate events, or restarts from creating duplicate matches or corrupted request state.
- **Parent user value:** The operator knows which obligation was actually paid and which cases require review.
- **Parent strategic role:** Transforms raw chain transfers into evidence-derived payment operations.
- **Strategic-role tags:** Evidence; Payee operations; Security/assurance
- **Current implementation:** No V2 backend processor exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Stable event IDs, atomic state transition, deduplication, replay tooling, concurrency and crash tests.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Stable event IDs, atomic state transition, deduplication, replay tooling, concurrency and crash tests.
- **Commercial hypothesis:** Protects records and support margin.
- **Boundary:** Exactly-once claims require evidence; design for safe at-least-once delivery.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** V2 matching architecture.
- **Next action:** gated.

### V2C-18 — Authoritative request-to-transaction match

- **Record class:** Capability
- **Parent capability:** PC-21 — Authoritative matching, watcher, and reconciliation
- **Area / phase / side / type:** Reconciliation / V2 Core / both / evidence relationship
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** State when ImplicitEx can prove a particular payment satisfied a particular request.
- **Parent user value:** The operator knows which obligation was actually paid and which cases require review.
- **Parent strategic role:** Transforms raw chain transfers into evidence-derived payment operations.
- **Strategic-role tags:** Evidence; Payee operations; Security/assurance
- **Current implementation:** Definition exists; persisted relationship, verifier, UI label, export, and proof packet do not.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** Valid signed request, frozen request ID, captured hash, V2C-15 verified event, and immutable relation.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Valid signed request, frozen request ID, captured hash, V2C-15 verified event, and immutable relation.
- **Commercial hypothesis:** Core “match” value.
- **Boundary:** Amount plus address is never authoritative.
- **Stop rule:** Amount plus address is never authoritative.
- **Source / evidence locator:** Revision 5 matching model.
- **Next action:** gated.

### V2C-19 — Suggested external-transfer match

- **Record class:** Capability
- **Parent capability:** PC-21 — Authoritative matching, watcher, and reconciliation
- **Area / phase / side / type:** Reconciliation / V2 Core / payee / assisted classification
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Help organize externally initiated transfers without pretending the request relationship is proven.
- **Parent user value:** The operator knows which obligation was actually paid and which cases require review.
- **Parent strategic role:** Transforms raw chain transfers into evidence-derived payment operations.
- **Strategic-role tags:** Evidence; Payee operations; Security/assurance
- **Current implementation:** No V2 matching engine or operator-confirmation UI exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Observed transfer source, bounded heuristics, candidate display, manual confirmation, provenance, and false-positive tests.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Observed transfer source, bounded heuristics, candidate display, manual confirmation, provenance, and false-positive tests.
- **Commercial hypothesis:** Convenience only; label “suggested” at every surface and never auto-promote ambiguous candidates.
- **Boundary:** The record remains within the governing self-custody, data, security, and scope boundaries.
- **Stop rule:** Convenience only; label “suggested” at every surface and never auto-promote ambiguous candidates.
- **Source / evidence locator:** Roadmap matching model.
- **Next action:** gated.

### V2C-20 — Uncertain match and disrupted-handoff recovery

- **Record class:** Capability
- **Parent capability:** PC-21 — Authoritative matching, watcher, and reconciliation
- **Area / phase / side / type:** Reconciliation/support / V2 Core / both / exception state
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Preserve truth when a wallet/browser handoff loses the hash or verification cannot finish.
- **Parent user value:** The operator knows which obligation was actually paid and which cases require review.
- **Parent strategic role:** Transforms raw chain transfers into evidence-derived payment operations.
- **Strategic-role tags:** Evidence; Payee operations; Security/assurance
- **Current implementation:** Present portal has uncertain transaction states.
- **Remaining work:** Request-aware recovery, operator workflow, and durable status do not.
- **Dependencies:** V2C-09/13/14, evidence collection, safe retry guidance, state transitions, and recovery tests.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2C-09/13/14, evidence collection, safe retry guidance, state transitions, and recovery tests.
- **Commercial hypothesis:** Avoids duplicate sends and false matches.
- **Boundary:** Never coerce uncertainty into “paid” for a cleaner dashboard.
- **Stop rule:** Never coerce uncertainty into “paid” for a cleaner dashboard.
- **Source / evidence locator:** Roadmap matching model and existing failure contract.
- **Next action:** gated.

### V2C-21 — Settlement and exception status model

- **Record class:** Capability
- **Parent capability:** PC-21 — Authoritative matching, watcher, and reconciliation
- **Area / phase / side / type:** Payment operations / V2 Core / payee / operational classification
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Distinguish exact, unmatched, failed, expired, cancelled, suggested, uncertain, and action-required outcomes.
- **Parent user value:** The operator knows which obligation was actually paid and which cases require review.
- **Parent strategic role:** Transforms raw chain transfers into evidence-derived payment operations.
- **Strategic-role tags:** Evidence; Payee operations; Security/assurance
- **Current implementation:** Definitions exist across roadmap and portal.
- **Remaining work:** Authoritative V2 state model, UI, filters, and transition tests do not.
- **Dependencies:** V2C-09/18/19/20, event provenance, deterministic rules, and full scenario suite.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2C-09/18/19/20, event provenance, deterministic rules, and full scenario suite.
- **Commercial hypothesis:** Turns chain data into operational meaning.
- **Boundary:** Avoid alarmist “risk” labels without evidence.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap V2 Core.
- **Next action:** gated.

### V2C-22 — Request-to-settlement evidence packet

- **Record class:** Capability
- **Parent capability:** PC-22 — Request-linked evidence, search, and export
- **Area / phase / side / type:** Evidence / V2 Core / both / portable artifact
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Join signed request, governing route, execution context, verified result, match classification, and provenance.
- **Parent user value:** Operators and third parties can retrieve, inspect, and reuse understandable payment records.
- **Parent strategic role:** Provides ongoing administrative value beyond a one-time transfer.
- **Strategic-role tags:** Evidence; Payee operations; Retention
- **Current implementation:** Coin Card transaction evidence and local proof packets exist.
- **Remaining work:** Complete request-linked packet, schema, verifier, and export do not.
- **Dependencies:** V2C-12/15/18, signed schemas, key/version handling, independent validation, and cross-runtime fixtures.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2C-12/15/18, signed schemas, key/version handling, independent validation, and cross-runtime fixtures.
- **Commercial hypothesis:** Differentiates through portable evidence, not insurance.
- **Boundary:** Never claim the packet proves off-chain identity or contract performance beyond recorded facts.
- **Stop rule:** Never claim the packet proves off-chain identity or contract performance beyond recorded facts.
- **Source / evidence locator:** Roadmap evidence-chain thesis.
- **Next action:** gated.

### V2C-23 — Searchable payment activity

- **Record class:** Capability
- **Parent capability:** PC-22 — Request-linked evidence, search, and export
- **Area / phase / side / type:** Payment operations / V2 Core / payee / retrieval surface
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Find payments by request, client, recipient, purpose, date, status, amount, and transaction hash.
- **Parent user value:** Operators and third parties can retrieve, inspect, and reuse understandable payment records.
- **Parent strategic role:** Provides ongoing administrative value beyond a one-time transfer.
- **Strategic-role tags:** Evidence; Payee operations; Retention
- **Current implementation:** Local activity UI exists.
- **Remaining work:** Tenant-backed indexed search, authorization, pagination, and correctness tests do not.
- **Dependencies:** Gate 0, stable objects, lifecycle/status model, query limits, tenant isolation, and acceptance tests.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Gate 0, stable objects, lifecycle/status model, query limits, tenant isolation, and acceptance tests.
- **Commercial hypothesis:** Core ongoing workspace value.
- **Boundary:** Do not add a general indexer merely to improve a small search set.
- **Stop rule:** Do not add a general indexer merely to improve a small search set.
- **Source / evidence locator:** Roadmap V2 Core.
- **Next action:** gated.

### V2C-24 — Formula-safe CSV export

- **Record class:** Capability
- **Parent capability:** PC-22 — Request-linked evidence, search, and export
- **Area / phase / side / type:** Records / V2 Core / payee / portability feature
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Give operators useful bookkeeping records without pretending to calculate taxes or replace accounting.
- **Parent user value:** Operators and third parties can retrieve, inspect, and reuse understandable payment records.
- **Parent strategic role:** Provides ongoing administrative value beyond a one-time transfer.
- **Strategic-role tags:** Evidence; Payee operations; Retention
- **Current implementation:** Local proof exports exist.
- **Remaining work:** Canonical V2 columns, filters, encoding, formula-injection defense, and fixtures do not.
- **Dependencies:** V2C-21/22/23, data export authorization, spreadsheet safety tests, and sample reconciliation.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2C-21/22/23, data export authorization, spreadsheet safety tests, and sample reconciliation.
- **Commercial hypothesis:** High-value small-business output.
- **Boundary:** Exclude tax advice and unsupported cost-basis calculations.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap V2 Core.
- **Next action:** gated.

### V2C-25 — Assisted setup

- **Record class:** Operational process
- **Parent capability:** PC-19 — Billing, entitlement, onboarding, and unit economics
- **Area / phase / side / type:** Customer operations / V2 Core / payee / onboarding service
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Use founder-level help as a focused challenger advantage while learning real workflows.
- **Parent user value:** The operator can buy the service they receive without an unexplained sender toll.
- **Parent strategic role:** Tests the focused-challenger business model independently of the deployed 1% fee.
- **Strategic-role tags:** Revenue; Support/operations; Payee operations
- **Current implementation:** Manual support ability exists.
- **Remaining work:** Bounded offer, checklist, time budget, data handling, and outcome tracking do not.
- **Dependencies:** Paid pilot, support procedure, consent, time/cost log, successful customer setup, and reusable learnings.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Paid pilot, support procedure, consent, time/cost log, successful customer setup, and reusable learnings.
- **Commercial hypothesis:** May justify setup fees.
- **Boundary:** Stop or productize work that becomes custom consulting or destroys margin.
- **Stop rule:** Stop or productize work that becomes custom consulting or destroys margin.
- **Source / evidence locator:** Roadmap pricing/customer-support doctrine.
- **Next action:** gated.

### V2C-26 — Support and gross-margin measurement

- **Record class:** Commercial experiment
- **Parent capability:** PC-19 — Billing, entitlement, onboarding, and unit economics
- **Area / phase / side / type:** Commercial operations / V2 Core / internal / economics instrumentation
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Prove low prices are sustainable after hosting, RPC, email, security, support, legal, and founder time.
- **Parent user value:** The operator can buy the service they receive without an unexplained sender toll.
- **Parent strategic role:** Tests the focused-challenger business model independently of the deployed 1% fee.
- **Strategic-role tags:** Revenue; Support/operations; Payee operations
- **Current implementation:** Cost categories and targets exist.
- **Remaining work:** Per-customer measurement, support tagging, cohort margin, and review do not.
- **Dependencies:** V2C-01/25, cost allocation, usage records, support time, churn/retention, and monthly review.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2C-01/25, cost allocation, usage records, support time, churn/retention, and monthly review.
- **Commercial hypothesis:** Price is an advantage, not a race to the bottom.
- **Boundary:** Raise, simplify, narrow, or stop if support economics fail.
- **Stop rule:** Raise, simplify, narrow, or stop if support economics fail.
- **Source / evidence locator:** Roadmap unit-economics gates.
- **Next action:** gated.

---

# 7. V2 Expansion pool — activate one capability at a time

Every record below is **Evidence-gated**. A capability may enter work only
after V2 Core is stable and customer evidence identifies it as the highest
retention, conversion, or support blocker. Completing one does not
automatically authorize another.

### V2E-01 — Contacts and recipient records

- **Record class:** Capability
- **Parent capability:** PC-23 — Retention and repeat-payment tools
- **Area / phase / side / type:** Relationships / V2 Expansion / both / convenience feature
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Reuse known parties with context and verified routes instead of reconstructing instructions.
- **Parent user value:** The operator spends less time reconstructing obligations and investigating exceptions.
- **Parent strategic role:** Adds retention only after V2 Core reveals the highest repeated-work blocker.
- **Strategic-role tags:** Retention; Payee operations; Payer usability
- **Current implementation:** Local recipient context exists.
- **Remaining work:** Private contacts, merge/update rules, permissions, and import/export do not.
- **Dependencies:** G0, OBJ-03, route verification, duplicate handling, privacy tests, and repeated-use evidence.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: G0, OBJ-03, route verification, duplicate handling, privacy tests, and repeated-use evidence.
- **Commercial hypothesis:** Retention feature.
- **Boundary:** Never imply a saved label verifies legal identity.
- **Stop rule:** Never imply a saved label verifies legal identity.
- **Source / evidence locator:** Roadmap V2 Expansion.
- **Next action:** gated.

### V2E-02 — Request templates

- **Record class:** Capability
- **Parent capability:** PC-23 — Retention and repeat-payment tools
- **Area / phase / side / type:** Payment preparation / V2 Expansion / payee / workflow feature
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Reuse common request terms without copying an old signed request.
- **Parent user value:** The operator spends less time reconstructing obligations and investigating exceptions.
- **Parent strategic role:** Adds retention only after V2 Core reveals the highest repeated-work blocker.
- **Strategic-role tags:** Retention; Payee operations; Payer usability
- **Current implementation:** No V2 template system exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** V2 Core requests, template versioning, fresh ID/nonce generation, edit review, and acceptance tests.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2 Core requests, template versioning, fresh ID/nonce generation, edit review, and acceptance tests.
- **Commercial hypothesis:** Saves repeat work.
- **Boundary:** A template is never executable authority and never reuses a prior signature.
- **Stop rule:** A template is never executable authority and never reuses a prior signature.
- **Source / evidence locator:** Roadmap V2 Expansion.
- **Next action:** gated.

### V2E-03 — Manual reminders

- **Record class:** Capability
- **Parent capability:** PC-23 — Retention and repeat-payment tools
- **Area / phase / side / type:** Receivables / V2 Expansion / payee / workflow feature
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Help operators follow up on open or overdue requests without maintaining a separate spreadsheet.
- **Parent user value:** The operator spends less time reconstructing obligations and investigating exceptions.
- **Parent strategic role:** Adds retention only after V2 Core reveals the highest repeated-work blocker.
- **Strategic-role tags:** Retention; Payee operations; Payer usability
- **Current implementation:** No reminder workflow exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Request lifecycle, customer context, reminder log, non-automated send action, and user testing.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Request lifecycle, customer context, reminder log, non-automated send action, and user testing.
- **Commercial hypothesis:** Supports “request it, receive it, record it.
- **Boundary:** ” Do not become a collections or harassment system.
- **Stop rule:** ” Do not become a collections or harassment system.
- **Source / evidence locator:** Roadmap V2 Expansion.
- **Next action:** gated.

### V2E-04 — Email reminders and notifications

- **Record class:** Capability
- **Parent capability:** PC-23 — Retention and repeat-payment tools
- **Area / phase / side / type:** Notifications / V2 Expansion / both / communication service
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Deliver request and payment events outside the workspace when customers demonstrate the need.
- **Parent user value:** The operator spends less time reconstructing obligations and investigating exceptions.
- **Parent strategic role:** Adds retention only after V2 Core reveals the highest repeated-work blocker.
- **Strategic-role tags:** Retention; Payee operations; Payer usability
- **Current implementation:** No approved V2 email collection, delivery, preference, unsubscribe, bounce, or privacy system exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** G0 data approval, lifecycle events, consent, delivery provider, abuse controls, and production evidence.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: G0 data approval, lifecycle events, consent, delivery provider, abuse controls, and production evidence.
- **Commercial hypothesis:** Useful retention layer; not active until PII posture is approved.
- **Boundary:** The record remains within the governing self-custody, data, security, and scope boundaries.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap V2 Expansion and G2 lineage.
- **Next action:** gated.

### V2E-05 — Partial-payment handling

- **Record class:** Capability
- **Parent capability:** PC-23 — Retention and repeat-payment tools
- **Area / phase / side / type:** Reconciliation / V2 Expansion / payee / exception workflow
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Show what remains when a verified transfer is below the request amount.
- **Parent user value:** The operator spends less time reconstructing obligations and investigating exceptions.
- **Parent strategic role:** Adds retention only after V2 Core reveals the highest repeated-work blocker.
- **Strategic-role tags:** Retention; Payee operations; Payer usability
- **Current implementation:** Exact settlement is V2 Core.
- **Remaining work:** Partial allocation, multi-transfer relationship, UI, and evidence rules do not exist.
- **Dependencies:** Authoritative matches, atomic arithmetic, allocation rules, concurrency tests, and customer demand.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Authoritative matches, atomic arithmetic, allocation rules, concurrency tests, and customer demand.
- **Commercial hypothesis:** Adds business meaning.
- **Boundary:** Do not silently mark an obligation paid in full.
- **Stop rule:** Do not silently mark an obligation paid in full.
- **Source / evidence locator:** Roadmap V2 Expansion.
- **Next action:** gated.

### V2E-06 — Overpayment handling

- **Record class:** Capability
- **Parent capability:** PC-23 — Retention and repeat-payment tools
- **Area / phase / side / type:** Reconciliation / V2 Expansion / payee / exception workflow
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Identify excess funds and preserve an explainable operator decision.
- **Parent user value:** The operator spends less time reconstructing obligations and investigating exceptions.
- **Parent strategic role:** Adds retention only after V2 Core reveals the highest repeated-work blocker.
- **Strategic-role tags:** Retention; Payee operations; Payer usability
- **Current implementation:** No overpayment allocation, note, or resolution flow exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** V2 Core matches, amount arithmetic, operator confirmation, evidence update, and scenario tests.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2 Core matches, amount arithmetic, operator confirmation, evidence update, and scenario tests.
- **Commercial hypothesis:** Reduces investigation.
- **Boundary:** ImplicitEx does not automatically refund or arbitrate the excess.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap V2 Expansion.
- **Next action:** gated.

### V2E-07 — Duplicate-suspect detection

- **Record class:** Capability
- **Parent capability:** PC-23 — Retention and repeat-payment tools
- **Area / phase / side / type:** Reconciliation / V2 Expansion / both / deterministic warning
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Flag likely repeat payment of the same obligation before or after execution.
- **Parent user value:** The operator spends less time reconstructing obligations and investigating exceptions.
- **Parent strategic role:** Adds retention only after V2 Core reveals the highest repeated-work blocker.
- **Strategic-role tags:** Retention; Payee operations; Payer usability
- **Current implementation:** Request IDs/replay rules are planned.
- **Remaining work:** Candidate rules, thresholds, explanation, override, and tuning do not exist.
- **Dependencies:** V2 Core history, deterministic features, false-positive review, clear “suspect” copy, and usage evidence.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2 Core history, deterministic features, false-positive review, clear “suspect” copy, and usage evidence.
- **Commercial hypothesis:** Prevents avoidable work/loss.
- **Boundary:** Warning fatigue or high false positives pauses rollout.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap V2 Expansion.
- **Next action:** gated.

### V2E-08 — Advanced exception review

- **Record class:** Capability
- **Parent capability:** PC-23 — Retention and repeat-payment tools
- **Area / phase / side / type:** Payment operations / V2 Expansion / payee / review workspace
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Consolidate partial, excess, duplicate, uncertain, unmatched, and stale cases requiring action.
- **Parent user value:** The operator spends less time reconstructing obligations and investigating exceptions.
- **Parent strategic role:** Adds retention only after V2 Core reveals the highest repeated-work blocker.
- **Strategic-role tags:** Retention; Payee operations; Payer usability
- **Current implementation:** V2 Core statuses are planned.
- **Remaining work:** Queue, assignments, notes, resolution actions, and evidence history do not.
- **Dependencies:** Multiple observed exception types, stable status model, permissions, audit log, and resolution testing.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Multiple observed exception types, stable status model, permissions, audit log, and resolution testing.
- **Commercial hypothesis:** Valuable only after exception volume exists.
- **Boundary:** Do not build an empty enterprise queue.
- **Stop rule:** Do not build an empty enterprise queue.
- **Source / evidence locator:** Roadmap V2 Expansion.
- **Next action:** gated.

### V2E-09 — Privacy-bounded analytics

- **Record class:** Capability
- **Parent capability:** PC-24 — Analytics, presentation, and bounded verification claims
- **Area / phase / side / type:** Analytics / V2 Expansion / payee / retention insight
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Show useful request, payment, conversion, and volume patterns without covert surveillance.
- **Parent user value:** Operators can understand use and present trustworthy context without enterprise machinery.
- **Parent strategic role:** Creates paid retention and identity value after demand, without arbitrary customization or identity overclaiming.
- **Strategic-role tags:** Retention; Trust; Payee operations
- **Current implementation:** Local/product instrumentation exists.
- **Remaining work:** Tenant analytics definitions, aggregation, retention, disclosure, and tests do not.
- **Dependencies:** G0 privacy approval, stable events, minimum useful metrics, opt-out/consent where needed, and review.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: G0 privacy approval, stable events, minimum useful metrics, opt-out/consent where needed, and review.
- **Commercial hypothesis:** Paid retention feature.
- **Boundary:** No public sender ranking or hidden behavioral profiling.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap V2 Expansion and Coin Card analytics caveat.
- **Next action:** gated.

### V2E-10 — Curated card themes

- **Record class:** Capability
- **Parent capability:** PC-24 — Analytics, presentation, and bounded verification claims
- **Area / phase / side / type:** Coin Card / V2 Expansion / payee / presentation feature
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Let operators fit the card to their work while keeping payment facts legible and trustworthy.
- **Parent user value:** Operators can understand use and present trustworthy context without enterprise machinery.
- **Parent strategic role:** Creates paid retention and identity value after demand, without arbitrary customization or identity overclaiming.
- **Strategic-role tags:** Retention; Trust; Payee operations
- **Current implementation:** Branded demo presentation exists.
- **Remaining work:** Theme tokens, curated catalog, contrast/security validation, and entitlement do not.
- **Dependencies:** Proven placement demand, presentation contract, accessibility, snapshot tests, and conversion signal.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Proven placement demand, presentation contract, accessibility, snapshot tests, and conversion signal.
- **Commercial hypothesis:** Possible paid identity value.
- **Boundary:** Themes never override lifecycle state or signed payment facts.
- **Stop rule:** Themes never override lifecycle state or signed payment facts.
- **Source / evidence locator:** Roadmap V2 Expansion.
- **Next action:** gated.

### V2E-11 — Curated portal views and customization

- **Record class:** Capability
- **Parent capability:** PC-24 — Analytics, presentation, and bounded verification claims
- **Area / phase / side / type:** Portal / V2 Expansion / payee / progressive-disclosure feature
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Let customers emphasize the views, fields, and filters they use without becoming lost in a universal cockpit.
- **Parent user value:** Operators can understand use and present trustworthy context without enterprise machinery.
- **Parent strategic role:** Creates paid retention and identity value after demand, without arbitrary customization or identity overclaiming.
- **Strategic-role tags:** Retention; Trust; Payee operations
- **Current implementation:** Modular portal shell exists.
- **Remaining work:** Saved layouts, role/task defaults, and guarded configuration do not.
- **Dependencies:** Stable shared objects, usability evidence, accessibility, migration rules, and reset-safe tests.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Stable shared objects, usability evidence, accessibility, migration rules, and reset-safe tests.
- **Commercial hypothesis:** Makes the “organized beast” usable.
- **Boundary:** No arbitrary CSS, hidden fees, hidden recipients, or suppressed warnings.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Portal architecture doctrine.
- **Next action:** gated.

### V2E-12 — Social-account control claims

- **Record class:** Capability
- **Parent capability:** PC-24 — Analytics, presentation, and bounded verification claims
- **Area / phase / side / type:** Verification / V2 Expansion / payee / graded evidence
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Show that a card operator controlled a named social account at a stated time.
- **Parent user value:** Operators can understand use and present trustworthy context without enterprise machinery.
- **Parent strategic role:** Creates paid retention and identity value after demand, without arbitrary customization or identity overclaiming.
- **Strategic-role tags:** Retention; Trust; Payee operations
- **Current implementation:** No social challenge, evidence schema, expiry, reverification, or display exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Claim taxonomy, provider flow, signed attestation, expiry, revocation, and impersonation tests.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Claim taxonomy, provider flow, signed attestation, expiry, revocation, and impersonation tests.
- **Commercial hypothesis:** Potential paid trust feature.
- **Boundary:** Never call social control legal-identity verification.
- **Stop rule:** Never call social control legal-identity verification.
- **Source / evidence locator:** Roadmap identity tiers.
- **Next action:** gated.

### V2E-13 — Domain-control claims

- **Record class:** Capability
- **Parent capability:** PC-24 — Analytics, presentation, and bounded verification claims
- **Area / phase / side / type:** Verification / V2 Expansion / payee / graded evidence
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Tie a payment credential to a domain the operator demonstrably controls.
- **Parent user value:** Operators can understand use and present trustworthy context without enterprise machinery.
- **Parent strategic role:** Creates paid retention and identity value after demand, without arbitrary customization or identity overclaiming.
- **Strategic-role tags:** Retention; Trust; Payee operations
- **Current implementation:** Domain routing exists for ImplicitEx itself.
- **Remaining work:** Customer DNS/file challenge, signed claim, expiry, and display do not.
- **Dependencies:** Verification protocol, rebinding/reassignment model, periodic recheck, and independent evidence.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Verification protocol, rebinding/reassignment model, periodic recheck, and independent evidence.
- **Commercial hypothesis:** Stronger business context without full KYB.
- **Boundary:** Domain control is not organizational identity.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap verification capability.
- **Next action:** gated.

### V2E-14 — Narrow verification badges

- **Record class:** Capability
- **Parent capability:** PC-24 — Analytics, presentation, and bounded verification claims
- **Area / phase / side / type:** Verification / V2 Expansion / payee / trust presentation
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Summarize exactly which evidence ImplicitEx verified without making broad identity or safety claims.
- **Parent user value:** Operators can understand use and present trustworthy context without enterprise machinery.
- **Parent strategic role:** Creates paid retention and identity value after demand, without arbitrary customization or identity overclaiming.
- **Strategic-role tags:** Retention; Trust; Payee operations
- **Current implementation:** Verification-state UI patterns exist.
- **Remaining work:** Claim levels, badge copy, review, expiry, removal, appeal, and support do not.
- **Dependencies:** V2E-12/13 or other defined proof, legal copy review, lifecycle tests, and customer comprehension test.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2E-12/13 or other defined proof, legal copy review, lifecycle tests, and customer comprehension test.
- **Commercial hypothesis:** Possible paid upsell.
- **Boundary:** Badge must name the verified fact and date; no “safe” or generic “verified person. ”
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap identity tiers and exclusions.
- **Next action:** gated.

### V2E-15 — Repeat-obligation preparation

- **Record class:** Capability
- **Parent capability:** PC-23 — Retention and repeat-payment tools
- **Area / phase / side / type:** Payment preparation / V2 Expansion / payer / workflow feature
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Recreate a recurring obligation for review without independently initiating a payment.
- **Parent user value:** The operator spends less time reconstructing obligations and investigating exceptions.
- **Parent strategic role:** Adds retention only after V2 Core reveals the highest repeated-work blocker.
- **Strategic-role tags:** Retention; Payee operations; Payer usability
- **Current implementation:** No repeat-obligation system exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Templates, contacts, request history, fresh terms/signature, final wallet approval, and demand evidence.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Templates, contacts, request history, fresh terms/signature, final wallet approval, and demand evidence.
- **Commercial hypothesis:** Bridges to controlled payments.
- **Boundary:** Do not market as automatic recurrence or retain open-ended token authority.
- **Stop rule:** Do not market as automatic recurrence or retain open-ended token authority.
- **Source / evidence locator:** Roadmap V2 Expansion and recurring boundary.
- **Next action:** gated.

### V2E-16 — Open-amount or reusable request

- **Record class:** Capability
- **Parent capability:** PC-23 — Retention and repeat-payment tools
- **Area / phase / side / type:** Payment requests / V2 Expansion / payee / flexible-request feature
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Support tips, donations, or customer-entered amounts after fixed obligations are proven.
- **Parent user value:** The operator spends less time reconstructing obligations and investigating exceptions.
- **Parent strategic role:** Adds retention only after V2 Core reveals the highest repeated-work blocker.
- **Strategic-role tags:** Retention; Payee operations; Payer usability
- **Current implementation:** Coin Card manifests model `OPEN_AMOUNT`.
- **Remaining work:** A V2 request lifecycle, payer-entered amount binding, reuse, matching, limits, abuse controls, and evidence behavior do not.
- **Dependencies:** Fixed-request success, named use case, fresh per-payment execution intent, amount validation, matching rules, and genuine repeat use.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Fixed-request success, named use case, fresh per-payment execution intent, amount validation, matching rules, and genuine repeat use.
- **Commercial hypothesis:** Distinct from a fixed signed request.
- **Boundary:** Never imply the recipient signed an amount chosen later by the payer.
- **Stop rule:** Never imply the recipient signed an amount chosen later by the payer.
- **Source / evidence locator:** Capability register V2 request scope.
- **Next action:** gated.

### V2E-17 — Printable/downloadable receipt and evidence delivery

- **Record class:** Capability
- **Parent capability:** PC-23 — Retention and repeat-payment tools
- **Area / phase / side / type:** Records / V2 Expansion / both / document-delivery feature
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Give a client or operator a legible PDF/print artifact derived from the verifiable evidence packet.
- **Parent user value:** The operator spends less time reconstructing obligations and investigating exceptions.
- **Parent strategic role:** Adds retention only after V2 Core reveals the highest repeated-work blocker.
- **Strategic-role tags:** Retention; Payee operations; Payer usability
- **Current implementation:** Local receipts/proof exports exist.
- **Remaining work:** V2 request-linked PDF schema, rendering, hash/provenance reference, delivery, and parity tests do not.
- **Dependencies:** V2C-22, stable display contract, deterministic rendering, download safety, and customer demand.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2C-22, stable display contract, deterministic rendering, download safety, and customer demand.
- **Commercial hypothesis:** Useful record, not a guarantee or tax document.
- **Boundary:** Email delivery additionally requires G0-approved contact data.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap receipt/export capabilities.
- **Next action:** gated.

---

# 8. V3 workflow experiment pool

At most one workflow experiment may be active. Selection occurs only after
V2 usage identifies the most damaging workflow blocker.

### V3W-01 — Scheduled payment preparation with final wallet approval

- **Record class:** Commercial experiment
- **Parent capability:** PC-26 — Controlled payer scheduling and approvals
- **Area / phase / side / type:** Controlled payments / V3 / payer / workflow experiment
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Prepare a payment at the right time while the user still reviews and signs the final wallet transaction.
- **Parent user value:** Payers can organize consequential payments without surrendering control.
- **Parent strategic role:** Tests the separate payer-side controlled-payment business after payee-side retention.
- **Strategic-role tags:** Execution; Payer usability; Security/assurance
- **Current implementation:** Scheduling concepts exist.
- **Remaining work:** Scheduler, reminders, fresh-state validation, approval UX, records, and failure handling do not.
- **Dependencies:** Repeated payer demand, V2 templates/contacts, data approval, no independent initiation, and real use.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Repeated payer demand, V2 templates/contacts, data approval, no independent initiation, and real use.
- **Commercial hypothesis:** Tests payer-side value.
- **Boundary:** Stop if reminders alone do not change behavior or justify cost.
- **Stop rule:** Stop if reminders alone do not change behavior or justify cost.
- **Source / evidence locator:** Capability register scheduled preparation.
- **Next action:** gated.

### V3W-02 — Bounded operational intelligence

- **Record class:** Commercial experiment
- **Parent capability:** PC-25 — Bounded operational intelligence
- **Area / phase / side / type:** Intelligence / V3 / payee / advisory experiment
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Explain verified records and exceptions without turning an LLM into payment authority.
- **Parent user value:** Operators spend less time translating records into safe next steps.
- **Parent strategic role:** Tests premium administrative value without granting AI financial authority.
- **Strategic-role tags:** Payee operations; Evidence; Support/operations
- **Current implementation:** Deterministic warnings exist.
- **Remaining work:** Evidence-bounded retrieval, answer provenance, refusal rules, evaluation, and UI do not.
- **Dependencies:** Stable V2 records, repeated analysis pain, evaluation set, citations, privacy approval, and no mutation.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Stable V2 records, repeated analysis pain, evaluation set, citations, privacy approval, and no mutation.
- **Commercial hypothesis:** Charge for work eliminated, not “AI.
- **Boundary:** ” Hallucination or unsupported advice pauses the experiment.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Capability register bounded intelligence.
- **Next action:** gated.

### V3W-03 — Evidence-linked factual search

- **Record class:** Commercial experiment
- **Parent capability:** PC-25 — Bounded operational intelligence
- **Area / phase / side / type:** Intelligence / V3 / payee / query experiment
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Answer questions such as “which requests remain unpaid?” with links to authoritative records.
- **Parent user value:** Operators spend less time translating records into safe next steps.
- **Parent strategic role:** Tests premium administrative value without granting AI financial authority.
- **Strategic-role tags:** Payee operations; Evidence; Support/operations
- **Current implementation:** Deterministic V2 search is planned.
- **Remaining work:** Natural-language intent parsing, authorization, citations, and evaluation do not.
- **Dependencies:** V2C-23, bounded query grammar, source links, tenant tests, and measured time savings.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2C-23, bounded query grammar, source links, tenant tests, and measured time savings.
- **Commercial hypothesis:** Useful only if ordinary filters are insufficient.
- **Boundary:** Never answer outside accessible evidence.
- **Stop rule:** Never answer outside accessible evidence.
- **Source / evidence locator:** Bounded intelligence doctrine.
- **Next action:** gated.

### V3W-04 — Exception explanation

- **Record class:** Commercial experiment
- **Parent capability:** PC-25 — Bounded operational intelligence
- **Area / phase / side / type:** Intelligence / V3 / both / explanation experiment
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Translate deterministic uncertain, unmatched, partial, or failed states into clear next steps.
- **Parent user value:** Operators spend less time translating records into safe next steps.
- **Parent strategic role:** Tests premium administrative value without granting AI financial authority.
- **Strategic-role tags:** Payee operations; Evidence; Support/operations
- **Current implementation:** Present portal has explicit failure copy.
- **Remaining work:** V2 evidence-linked explanation generation and evaluation do not.
- **Dependencies:** Stable exception taxonomy, deterministic facts, approved action library, citation, and safety tests.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Stable exception taxonomy, deterministic facts, approved action library, citation, and safety tests.
- **Commercial hypothesis:** Improves support.
- **Boundary:** It may explain evidence; it may not invent settlement facts, legal advice, or reimbursement.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap exception doctrine.
- **Next action:** gated.

### V3W-05 — Draft action preparation

- **Record class:** Commercial experiment
- **Parent capability:** PC-25 — Bounded operational intelligence
- **Area / phase / side / type:** Intelligence / V3 / payee / advisory workflow
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Prepare a reminder, reconciliation note, export, or payment draft for explicit human approval.
- **Parent user value:** Operators spend less time translating records into safe next steps.
- **Parent strategic role:** Tests premium administrative value without granting AI financial authority.
- **Strategic-role tags:** Payee operations; Evidence; Support/operations
- **Current implementation:** No bounded action-draft system exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** V3W-02/04, allowlisted actions, preview, no silent execution, audit log, and human-approval tests.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V3W-02/04, allowlisted actions, preview, no silent execution, audit log, and human-approval tests.
- **Commercial hypothesis:** Saves administrative work.
- **Boundary:** No payment, route, refund, or customer message is sent autonomously.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Companion doctrine and V3 experiment pool.
- **Next action:** gated.

### V3W-06 — Preparer/reviewer workflow

- **Record class:** Commercial experiment
- **Parent capability:** PC-26 — Controlled payer scheduling and approvals
- **Area / phase / side / type:** Approvals / V3 / payer / small-team experiment
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Let one person prepare a payment while the wallet authority reviews and signs.
- **Parent user value:** Payers can organize consequential payments without surrendering control.
- **Parent strategic role:** Tests the separate payer-side controlled-payment business after payee-side retention.
- **Strategic-role tags:** Execution; Payer usability; Security/assurance
- **Current implementation:** No V2 team/role platform exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Named team demand, G0 role model, immutable draft, reviewer comparison, audit trail, and live test.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Named team demand, G0 role model, immutable draft, reviewer comparison, audit trail, and live test.
- **Commercial hypothesis:** Possible higher tier.
- **Boundary:** Do not build complex corporate RBAC or let the preparer obtain payment authority.
- **Stop rule:** Do not build complex corporate RBAC or let the preparer obtain payment authority.
- **Source / evidence locator:** Capability register team access.
- **Next action:** gated.

### V3W-07 — Safe-based approval integration

- **Record class:** Commercial experiment
- **Parent capability:** PC-26 — Controlled payer scheduling and approvals
- **Area / phase / side / type:** Approvals/integration / V3 / payer / partner experiment
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Reuse established multisignature and spending-control infrastructure rather than inventing a treasury wallet.
- **Parent user value:** Payers can organize consequential payments without surrendering control.
- **Parent strategic role:** Tests the separate payer-side controlled-payment business after payee-side retention.
- **Strategic-role tags:** Execution; Payer usability; Security/assurance
- **Current implementation:** Safe has been competitively assessed.
- **Remaining work:** No ImplicitEx integration exists.
- **Dependencies:** Customers already using Safe, exact integration scope, permission review, test Safe, transaction simulation, and partner/version monitoring.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Customers already using Safe, exact integration scope, permission review, test Safe, transaction simulation, and partner/version monitoring.
- **Commercial hypothesis:** Adds approval value without custody.
- **Boundary:** ImplicitEx must not become an unnoticed privileged Safe module.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Capability register Safe/team doors.
- **Next action:** gated.

---

# 9. V3 access experiment pool

At most one access experiment may be active alongside one workflow experiment.
Selection must respond to a measured V2 conversion blocker.

### V3A-01 — Embedded payment-request flow

- **Record class:** Commercial experiment
- **Parent capability:** PC-27 — Embedded, QR, and POS request access
- **Area / phase / side / type:** Distribution / V3 / payer / access experiment
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Let a site present an authenticated ImplicitEx request without sending the payer through unrelated portal views.
- **Parent user value:** Payers can enter a clear verified flow from the context where payment begins.
- **Parent strategic role:** Tests distribution channels only after signed request integrity is proven.
- **Strategic-role tags:** Distribution/access; Payer usability; Trust
- **Current implementation:** Static Coin Card embed exists.
- **Remaining work:** Request embed, parent/child trust, CSP, sizing, completion callback, and tests do not.
- **Dependencies:** V2 signed requests, embed threat model, origin controls, browser matrix, and real placement evidence.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2 signed requests, embed threat model, origin controls, browser matrix, and real placement evidence.
- **Commercial hypothesis:** Improves distribution.
- **Boundary:** Embedded surfaces must show signed terms and never authorize the wallet silently.
- **Stop rule:** Embedded surfaces must show signed terms and never authorize the wallet silently.
- **Source / evidence locator:** Capability register access pool.
- **Next action:** gated.

### V3A-02 — Safe return-URL request flow

- **Record class:** Commercial experiment
- **Parent capability:** PC-27 — Embedded, QR, and POS request access
- **Area / phase / side / type:** Distribution/security / V3 / payer / access experiment
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Return a payer to the originating business after a verified request outcome.
- **Parent user value:** Payers can enter a clear verified flow from the context where payment begins.
- **Parent strategic role:** Tests distribution channels only after signed request integrity is proven.
- **Strategic-role tags:** Distribution/access; Payer usability; Trust
- **Current implementation:** General portal return behavior exists.
- **Remaining work:** Allowlisted, signed request return URLs, status payload, and open-redirect tests do not.
- **Dependencies:** V2 request schema, origin validation, user-visible destination, privacy policy, and hostile URL suite.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2 request schema, origin validation, user-visible destination, privacy policy, and hostile URL suite.
- **Commercial hypothesis:** Supports lightweight integrations.
- **Boundary:** Never leak private evidence in query strings or trust an unsigned return URL.
- **Stop rule:** Never leak private evidence in query strings or trust an unsigned return URL.
- **Source / evidence locator:** Capability register embedded access.
- **Next action:** gated.

### V3A-03 — Payment-request QR handoff

- **Record class:** Commercial experiment
- **Parent capability:** PC-27 — Embedded, QR, and POS request access
- **Area / phase / side / type:** Mobile access / V3 / both / access experiment
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Move authenticated request terms from a screen or printed surface into the payer's wallet flow.
- **Parent user value:** Payers can enter a clear verified flow from the context where payment begins.
- **Parent strategic role:** Tests distribution channels only after signed request integrity is proven.
- **Strategic-role tags:** Distribution/access; Payer usability; Trust
- **Current implementation:** Coin Card identity QR exists.
- **Remaining work:** Signed request QR, tamper-resistant confirmation, density limits, and scanning tests do not.
- **Dependencies:** V2C-10/11, visible recipient and address confirmation, mobile matrix, and real-use evidence.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2C-10/11, visible recipient and address confirmation, mobile matrix, and real-use evidence.
- **Commercial hypothesis:** Reduces mobile coordination.
- **Boundary:** QR is a carrier, not proof; altered content must fail verification.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Capability register QR/POS.
- **Next action:** gated.

### V3A-04 — POS presentation and settled state

- **Record class:** Commercial experiment
- **Parent capability:** PC-27 — Embedded, QR, and POS request access
- **Area / phase / side / type:** In-person payments / V3 / both / access experiment
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Turn a request into a full-screen in-person payment surface with unambiguous pending/confirmed state.
- **Parent user value:** Payers can enter a clear verified flow from the context where payment begins.
- **Parent strategic role:** Tests distribution channels only after signed request integrity is proven.
- **Strategic-role tags:** Distribution/access; Payer usability; Trust
- **Current implementation:** Card QR and transaction status components exist.
- **Remaining work:** POS mode, screen-lock behavior, watcher connection, and arrival feedback do not.
- **Dependencies:** V3A-03, V2 watcher, in-person demand, mobile testing, and genuine transaction observations.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V3A-03, V2 watcher, in-person demand, mobile testing, and genuine transaction observations.
- **Commercial hypothesis:** Potential micro-merchant access.
- **Boundary:** Do not imply fiat conversion or guaranteed settlement.
- **Stop rule:** Do not imply fiat conversion or guaranteed settlement.
- **Source / evidence locator:** Capability register QR/POS.
- **Next action:** gated.

### V3A-05 — Recent ImplicitEx recipients

- **Record class:** Commercial experiment
- **Parent capability:** PC-28 — Recipient, naming, fiat-display, and wallet access
- **Area / phase / side / type:** Recipient access / V3 / payer / convenience experiment
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Repeat known ImplicitEx relationships without broad chain surveillance or raw-address re-entry.
- **Parent user value:** Payers can recognize and reselect a destination while still verifying the actual route.
- **Parent strategic role:** Tests measured access blockers without confusing convenience with identity.
- **Strategic-role tags:** Payer usability; Distribution/access; Trust
- **Current implementation:** Local recipient context exists.
- **Remaining work:** Request/card-aware recent list, route-currentness recheck, and UX do not.
- **Dependencies:** Local or approved private history, Coin Card currentness, duplicate rules, and repeat-use evidence.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Local or approved private history, Coin Card currentness, duplicate rules, and repeat-use evidence.
- **Commercial hypothesis:** Improves return use.
- **Boundary:** Never bypass route reverification because an address is “recent. ”
- **Stop rule:** Never bypass route reverification because an address is “recent.
- **Source / evidence locator:** Capability register recent recipients.
- **Next action:** gated.

### V3A-06 — Device-local recipient labels

- **Record class:** Commercial experiment
- **Parent capability:** PC-28 — Recipient, naming, fiat-display, and wallet access
- **Area / phase / side / type:** Recipient access / V3 / payer / local-only experiment
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Let a user attach familiar labels without requiring an account or publishing them.
- **Parent user value:** Payers can recognize and reselect a destination while still verifying the actual route.
- **Parent strategic role:** Tests measured access blockers without confusing convenience with identity.
- **Strategic-role tags:** Payer usability; Distribution/access; Trust
- **Current implementation:** Browser-local storage patterns exist.
- **Remaining work:** Label schema, backup warning, migration, deletion, and display do not.
- **Dependencies:** V3A-05, privacy copy, collision handling, device-loss disclosure, and usability testing.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V3A-05, privacy copy, collision handling, device-loss disclosure, and usability testing.
- **Commercial hypothesis:** Low-cost convenience, not identity evidence.
- **Boundary:** Do not sync until Gate 0 data approval.
- **Stop rule:** Do not sync until Gate 0 data approval.
- **Source / evidence locator:** Roadmap A1 caveat.
- **Next action:** gated.

### V3A-07 — ENS resolution with forward verification

- **Record class:** Commercial experiment
- **Parent capability:** PC-28 — Recipient, naming, fiat-display, and wallet access
- **Area / phase / side / type:** Naming/interoperability / V3 / both / access experiment
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Accept familiar ENS names while proving the resolved route and displaying the underlying address before execution.
- **Parent user value:** Payers can recognize and reselect a destination while still verifying the actual route.
- **Parent strategic role:** Tests measured access blockers without confusing convenience with identity.
- **Strategic-role tags:** Payer usability; Distribution/access; Trust
- **Current implementation:** Coin Card handles exist.
- **Remaining work:** ENS resolver, chain-aware records, caching, forward verification, error states, and tests do not.
- **Dependencies:** Demonstrated ENS demand, trusted provider/resolver, expiry policy, adverse cases, and production test.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Demonstrated ENS demand, trusted provider/resolver, expiry policy, adverse cases, and production test.
- **Commercial hypothesis:** Complement ENS rather than replace it.
- **Boundary:** Resolution cannot establish legal identity.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Competitive teardown and capability register.
- **Next action:** gated.

### V3A-08 — Fiat-equivalent display

- **Record class:** Commercial experiment
- **Parent capability:** PC-28 — Recipient, naming, fiat-display, and wallet access
- **Area / phase / side / type:** Legibility / V3 / both / access experiment
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Show approximate local-money context for stablecoin amounts without offering conversion.
- **Parent user value:** Payers can recognize and reselect a destination while still verifying the actual route.
- **Parent strategic role:** Tests measured access blockers without confusing convenience with identity.
- **Strategic-role tags:** Payer usability; Distribution/access; Trust
- **Current implementation:** USDC amount display exists.
- **Remaining work:** Price source, freshness, currency selection, stale-state handling, and disclosure do not.
- **Dependencies:** Qualified user demand, reliable source, timestamp/freshness policy, fallback, and accuracy tests.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Qualified user demand, reliable source, timestamp/freshness policy, fallback, and accuracy tests.
- **Commercial hypothesis:** Helps non-crypto comprehension.
- **Boundary:** Label display-only estimates; ImplicitEx does not quote or execute FX.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap A6.
- **Next action:** gated.

### V3A-09 — Gas abstraction

- **Record class:** Commercial experiment
- **Parent capability:** PC-29 — Gas abstraction and smart-account controls
- **Area / phase / side / type:** Wallet access / V3 / payer / access experiment
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Remove the need to obtain a separate gas token when this is a measured completion blocker.
- **Parent user value:** A qualified payer can complete a USDC payment without separately acquiring gas.
- **Parent strategic role:** Tests a high-leverage funnel fix only after its actual attrition is measured.
- **Strategic-role tags:** Payer usability; Execution; Security/assurance
- **Current implementation:** Native-gas transaction flow exists.
- **Remaining work:** Account abstraction choice, sponsor policy, audited surface, monitoring, and UX do not.
- **Dependencies:** Measured gas-token attrition, current wallet capability review, counsel/security review, cost model, and live bounded pilot.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Measured gas-token attrition, current wallet capability review, counsel/security review, cost model, and live bounded pilot.
- **Commercial hypothesis:** Potentially high leverage.
- **Boundary:** Do not adopt unaudited smart-account authority or economically unbounded sponsorship.
- **Stop rule:** Do not adopt unaudited smart-account authority or economically unbounded sponsorship.
- **Source / evidence locator:** Capability register gas abstraction.
- **Next action:** gated.

### V3A-10 — Smart-account feasibility and authority model

- **Record class:** Commercial experiment
- **Parent capability:** PC-29 — Gas abstraction and smart-account controls
- **Area / phase / side / type:** Wallet architecture / V3 / payer / research experiment
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Determine whether existing wallet or ERC-4337 infrastructure can improve access without key-share control.
- **Parent user value:** A qualified payer can complete a USDC payment without separately acquiring gas.
- **Parent strategic role:** Tests a high-leverage funnel fix only after its actual attrition is measured.
- **Strategic-role tags:** Payer usability; Execution; Security/assurance
- **Current implementation:** Competitive concepts exist.
- **Remaining work:** Provider comparison, authority diagram, upgrade/recovery risk, portability, and prototype do not.
- **Dependencies:** V3A-09 entry evidence, current primary-source review, counsel, threat model, and reversible test.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V3A-09 entry evidence, current primary-source review, counsel, threat model, and reversible test.
- **Commercial hypothesis:** Research input only.
- **Boundary:** Reject architectures that give ImplicitEx unilateral signing or key-share control.
- **Stop rule:** Reject architectures that give ImplicitEx unilateral signing or key-share control.
- **Source / evidence locator:** Roadmap A9/A10.
- **Next action:** gated.

### V3A-11 — Paymaster policy, controls, and economics

- **Record class:** Commercial experiment
- **Parent capability:** PC-29 — Gas abstraction and smart-account controls
- **Area / phase / side / type:** Gas operations / V3 / payer / service control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Bound who receives sponsored gas, for which calls, at what limits, and how abuse/costs are managed.
- **Parent user value:** A qualified payer can complete a USDC payment without separately acquiring gas.
- **Parent strategic role:** Tests a high-leverage funnel fix only after its actual attrition is measured.
- **Strategic-role tags:** Payer usability; Execution; Security/assurance
- **Current implementation:** No paymaster exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Smart-account decision, allowlisted calls, quotas, simulation, abuse monitoring, cost/recovery model, and incident stop switch.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Smart-account decision, allowlisted calls, quotas, simulation, abuse monitoring, cost/recovery model, and incident stop switch.
- **Commercial hypothesis:** Sponsorship must improve conversion with positive unit economics.
- **Boundary:** Never make a general transaction relay.
- **Stop rule:** Never make a general transaction relay.
- **Source / evidence locator:** Capability register gas abstraction.
- **Next action:** gated.

### V3A-12 — Third-party fiat on-ramp

- **Record class:** Commercial experiment
- **Parent capability:** PC-30 — Licensed-partner fiat on-ramp access
- **Area / phase / side / type:** Access/partners / V3 / payer / partner experiment
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Let a user acquire supported USDC through a licensed provider that delivers directly to the user's wallet.
- **Parent user value:** A payer can enter the supported workflow without ImplicitEx receiving fiat.
- **Parent strategic role:** Closes a measured access gap while preserving the partner and custody boundary.
- **Strategic-role tags:** Distribution/access; Payer usability; Governance
- **Current implementation:** No partner selection or integration exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Measured acquisition blocker, corridor/state coverage, vendor diligence, counsel, redirect integrity, fee/KYC disclosure, support routing, and pilot evidence.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Measured acquisition blocker, corridor/state coverage, vendor diligence, counsel, redirect integrity, fee/KYC disclosure, support routing, and pilot evidence.
- **Commercial hypothesis:** Partner economics may supplement revenue.
- **Boundary:** ImplicitEx never receives fiat or controls the purchased USDC.
- **Stop rule:** ImplicitEx never receives fiat or controls the purchased USDC.
- **Source / evidence locator:** Capability register on-ramp.
- **Next action:** gated.

### V3A-13 — Partner redirect integrity

- **Record class:** Commercial experiment
- **Parent capability:** PC-30 — Licensed-partner fiat on-ramp access
- **Area / phase / side / type:** Partner security / V3 / payer / integration control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Ensure an on-ramp handoff cannot change wallet, asset, chain, amount, or return destination unnoticed.
- **Parent user value:** A payer can enter the supported workflow without ImplicitEx receiving fiat.
- **Parent strategic role:** Closes a measured access gap while preserving the partner and custody boundary.
- **Strategic-role tags:** Distribution/access; Payer usability; Governance
- **Current implementation:** No on-ramp redirect implementation exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** V3A-12, signed/stateful handoff, allowlisted origins, nonce/expiry, return verification, and hostile redirect tests.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V3A-12, signed/stateful handoff, allowlisted origins, nonce/expiry, return verification, and hostile redirect tests.
- **Commercial hypothesis:** Protects access flow.
- **Boundary:** Partner branding cannot obscure who performs KYC, conversion, or support.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Capability register partner controls.
- **Next action:** gated.

### V3A-14 — Partner fee, KYC, coverage, and support disclosure

- **Record class:** Commercial experiment
- **Parent capability:** PC-30 — Licensed-partner fiat on-ramp access
- **Area / phase / side / type:** Partner operations / V3 / payer / disclosure control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Show total expected cost, responsible provider, KYC step, availability, and problem-resolution path before handoff.
- **Parent user value:** A payer can enter the supported workflow without ImplicitEx receiving fiat.
- **Parent strategic role:** Closes a measured access gap while preserving the partner and custody boundary.
- **Strategic-role tags:** Distribution/access; Payer usability; Governance
- **Current implementation:** General fee clarity exists.
- **Remaining work:** Partner-specific live disclosures and coverage monitoring do not.
- **Dependencies:** V3A-12, provider terms/data, freshness owner, jurisdiction rules, copy review, and customer testing.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V3A-12, provider terms/data, freshness owner, jurisdiction rules, copy review, and customer testing.
- **Commercial hypothesis:** Prevents a “cheap” claim from hiding partner spreads.
- **Boundary:** Pause corridors when provider facts are stale.
- **Stop rule:** Pause corridors when provider facts are stale.
- **Source / evidence locator:** Roadmap D1 and partner doctrine.
- **Next action:** gated.

### V3A-15 — Direct Coinbase Wallet compatibility

- **Record class:** Commercial experiment
- **Parent capability:** PC-28 — Recipient, naming, fiat-display, and wallet access
- **Area / phase / side / type:** Wallet access / V3 / payer / access experiment
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Serve qualified users whose working wallet is Coinbase Wallet without requiring MetaMask.
- **Parent user value:** Payers can recognize and reselect a destination while still verifying the actual route.
- **Parent strategic role:** Tests measured access blockers without confusing convenience with identity.
- **Strategic-role tags:** Payer usability; Distribution/access; Trust
- **Current implementation:** WalletConnect provides broader connectivity, but no explicit Coinbase Wallet production compatibility claim, deep-link matrix, continuity evidence, or support policy is recorded.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** Measured wallet demand, current Coinbase Wallet behavior, connect/dispatch/return/receipt tests on supported devices, and production evidence.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Measured wallet demand, current Coinbase Wallet behavior, connect/dispatch/return/receipt tests on supported devices, and production evidence.
- **Commercial hypothesis:** Wallet breadth responds to actual users.
- **Boundary:** Do not publish support based only on a generic WalletConnect assumption.
- **Stop rule:** Do not publish support based only on a generic WalletConnect assumption.
- **Source / evidence locator:** Roadmap A10.
- **Next action:** gated.

---

# 10. Conditional legal, sanctions, and risk-control implementations

These records are not ordinary backlog items. Counsel or the Legal Development
Hierarchy may convert them into binding release controls.

### RISK-01 — Address-risk and sanctions-control determination

- **Record class:** Control
- **Parent capability:** PC-31 — Address-risk and sanctions operations
- **Area / phase / side / type:** Legal/risk / V1 onward / both / counsel determination
- **Implementation maturity:** Defined or specified
- **Work authorization:** Legally gated
- **Purpose:** Define ImplicitEx's actual obligations and proportionate controls for the product flow and jurisdictions.
- **Parent user value:** Users and partners receive calibrated checks and a defined exception path.
- **Parent strategic role:** Protects legal/partner viability without making unsupported safety claims.
- **Strategic-role tags:** Security/assurance; Governance; Support/operations
- **Current implementation:** Risks are identified; written counsel conclusion, feature-by-feature trigger, and release treatment do not exist.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Actual architecture, authority map, markets, current legal sources, and attorney-reviewed determination.
- **Entry gate:** The required counsel or formal legal determination is recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Actual architecture, authority map, markets, current legal sources, and attorney-reviewed determination.
- **Commercial hypothesis:** Protects enterprise and partner viability.
- **Boundary:** Do not describe software as automatically exempt or screening as universal legal clearance.
- **Stop rule:** Do not describe software as automatically exempt or screening as universal legal clearance.
- **Source / evidence locator:** V1-08 and legal-status doctrine.
- **Next action:** counsel gate.

### RISK-02 — Address-risk policy

- **Record class:** Control
- **Parent capability:** PC-31 — Address-risk and sanctions operations
- **Area / phase / side / type:** Risk operations / conditional / both / governing policy
- **Implementation maturity:** Defined or specified
- **Work authorization:** Legally gated
- **Purpose:** State which addresses/events are checked, when, against what categories, and what outcomes follow.
- **Parent user value:** Users and partners receive calibrated checks and a defined exception path.
- **Parent strategic role:** Protects legal/partner viability without making unsupported safety claims.
- **Strategic-role tags:** Security/assurance; Governance; Support/operations
- **Current implementation:** No approved operational policy exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** RISK-01, provider/source design, false-positive path, privacy/logging, UX, tests, and owner.
- **Entry gate:** The required counsel or formal legal determination is recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: RISK-01, provider/source design, false-positive path, privacy/logging, UX, tests, and owner.
- **Commercial hypothesis:** Supports trust and partner diligence.
- **Boundary:** “Checked” must never mean “safe. ”
- **Stop rule:** “Checked” must never mean “safe.
- **Source / evidence locator:** Roadmap address-screening section.
- **Next action:** gated.

### RISK-03 — Screening-provider evaluation

- **Record class:** Control
- **Parent capability:** PC-31 — Address-risk and sanctions operations
- **Area / phase / side / type:** Vendor/risk / conditional / both / partner selection
- **Implementation maturity:** Defined or specified
- **Work authorization:** Legally gated
- **Purpose:** Compare coverage, source quality, latency, uptime, false positives, appeal support, retention, and cost.
- **Parent user value:** Users and partners receive calibrated checks and a defined exception path.
- **Parent strategic role:** Protects legal/partner viability without making unsupported safety claims.
- **Strategic-role tags:** Security/assurance; Governance; Support/operations
- **Current implementation:** Candidate vendor category exists.
- **Remaining work:** Diligence and selection do not.
- **Dependencies:** RISK-01/02, representative test set, contract/privacy review, outage behavior, and cost model.
- **Entry gate:** The required counsel or formal legal determination is recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: RISK-01/02, representative test set, contract/privacy review, outage behavior, and cost model.
- **Commercial hypothesis:** Buy only the control required and useful.
- **Boundary:** Reject vendors whose data terms undermine privacy or support margin.
- **Stop rule:** Reject vendors whose data terms undermine privacy or support margin.
- **Source / evidence locator:** Roadmap A11.
- **Next action:** gated.

### RISK-04 — Sanctions-source freshness controls

- **Record class:** Control
- **Parent capability:** PC-31 — Address-risk and sanctions operations
- **Area / phase / side / type:** Risk operations / conditional / both / data-freshness control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Legally gated
- **Purpose:** Prevent stale sanctions or risk data from being presented as a current check.
- **Parent user value:** Users and partners receive calibrated checks and a defined exception path.
- **Parent strategic role:** Protects legal/partner viability without making unsupported safety claims.
- **Strategic-role tags:** Security/assurance; Governance; Support/operations
- **Current implementation:** No source monitor or freshness threshold exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Selected sources/provider, timestamps, update SLA, monitor, stale-state UX, and outage drill.
- **Entry gate:** The required counsel or formal legal determination is recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Selected sources/provider, timestamps, update SLA, monitor, stale-state UX, and outage drill.
- **Commercial hypothesis:** Required if checks become binding.
- **Boundary:** Fail according to approved policy; never silently use stale data.
- **Stop rule:** Fail according to approved policy; never silently use stale data.
- **Source / evidence locator:** Legal maintenance doctrine.
- **Next action:** gated.

### RISK-05 — False-positive handling and appeal

- **Record class:** Control
- **Parent capability:** PC-31 — Address-risk and sanctions operations
- **Area / phase / side / type:** Risk/support / conditional / both / exception workflow
- **Implementation maturity:** Defined or specified
- **Work authorization:** Legally gated
- **Purpose:** Give legitimate users a documented path when screening or policy blocks a route.
- **Parent user value:** Users and partners receive calibrated checks and a defined exception path.
- **Parent strategic role:** Protects legal/partner viability without making unsupported safety claims.
- **Strategic-role tags:** Security/assurance; Governance; Support/operations
- **Current implementation:** No appeal intake, review authority, SLA, evidence, or decision log exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** RISK-02/03, privacy rules, reviewer authority, non-bypass controls, test cases, and support capacity.
- **Entry gate:** The required counsel or formal legal determination is recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: RISK-02/03, privacy rules, reviewer authority, non-bypass controls, test cases, and support capacity.
- **Commercial hypothesis:** Necessary to control support harm.
- **Boundary:** Support cannot override a legal block informally.
- **Stop rule:** Support cannot override a legal block informally.
- **Source / evidence locator:** Roadmap A11 caveats.
- **Next action:** gated.

### RISK-06 — Screening-provider outage behavior

- **Record class:** Control
- **Parent capability:** PC-31 — Address-risk and sanctions operations
- **Area / phase / side / type:** Reliability/risk / conditional / both / fail-state control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Legally gated
- **Purpose:** Define whether affected sends block, degrade, queue, or disclose unavailable screening.
- **Parent user value:** Users and partners receive calibrated checks and a defined exception path.
- **Parent strategic role:** Protects legal/partner viability without making unsupported safety claims.
- **Strategic-role tags:** Security/assurance; Governance; Support/operations
- **Current implementation:** No approved behavior exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** RISK-01/02/03, risk appetite, cached-data rule, UX, operational alert, and outage test.
- **Entry gate:** The required counsel or formal legal determination is recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: RISK-01/02/03, risk appetite, cached-data rule, UX, operational alert, and outage test.
- **Commercial hypothesis:** Avoids improvised production decisions.
- **Boundary:** Behavior must match legal advice and customer copy.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap screening architecture.
- **Next action:** gated.

### RISK-07 — Risk-check logging and retention

- **Record class:** Control
- **Parent capability:** PC-31 — Address-risk and sanctions operations
- **Area / phase / side / type:** Privacy/risk / conditional / both / evidence control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Legally gated
- **Purpose:** Preserve only the check evidence needed for operations or obligations.
- **Parent user value:** Users and partners receive calibrated checks and a defined exception path.
- **Parent strategic role:** Protects legal/partner viability without making unsupported safety claims.
- **Strategic-role tags:** Security/assurance; Governance; Support/operations
- **Current implementation:** No approved data fields, access, retention, deletion, or disclosure exist.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** G0-09/11, RISK-02, counsel, secure store, access tests, and retention job.
- **Entry gate:** The required counsel or formal legal determination is recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: G0-09/11, RISK-02, counsel, secure store, access tests, and retention job.
- **Commercial hypothesis:** Supports defensibility without building a surveillance archive.
- **Boundary:** Minimize address attribution and vendor payloads.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** PII posture and screening policy.
- **Next action:** gated.

### RISK-08 — Blocked/unavailable state UX

- **Record class:** Control
- **Parent capability:** PC-31 — Address-risk and sanctions operations
- **Area / phase / side / type:** Risk/product / conditional / payer / fail-closed surface
- **Implementation maturity:** Defined or specified
- **Work authorization:** Legally gated
- **Purpose:** Explain blocked, review-required, unavailable, or stale-check states accurately and without defamatory claims.
- **Parent user value:** Users and partners receive calibrated checks and a defined exception path.
- **Parent strategic role:** Protects legal/partner viability without making unsupported safety claims.
- **Strategic-role tags:** Security/assurance; Governance; Support/operations
- **Current implementation:** Generic portal blocking states exist.
- **Remaining work:** Screening-specific reason codes, safe copy, appeal pointer, and tests do not.
- **Dependencies:** RISK-02/05/06, counsel copy, accessibility, no execution bypass, and comprehension test.
- **Entry gate:** The required counsel or formal legal determination is recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: RISK-02/05/06, counsel copy, accessibility, no execution bypass, and comprehension test.
- **Commercial hypothesis:** Trust feature only if calibrated.
- **Boundary:** Do not display criminal labels or overclaim database certainty.
- **Stop rule:** Do not display criminal labels or overclaim database certainty.
- **Source / evidence locator:** Roadmap risk UX.
- **Next action:** gated.

### RISK-09 — Renewed counsel-review triggers

- **Record class:** Governance decision
- **Parent capability:** PC-32 — Legal release and maintenance governance
- **Area / phase / side / type:** Legal governance / V1 onward / internal / change control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Decision required
- **Purpose:** Reopen legal review when authority, data, market, partner, asset, chain, automation, or product claims change.
- **Parent user value:** Customers receive an accurately described service within supported availability.
- **Parent strategic role:** Separates internal research from legal clearance and makes legal maintenance operational.
- **Strategic-role tags:** Governance; Security/assurance
- **Current implementation:** Trigger categories are scattered.
- **Remaining work:** A versioned trigger matrix, owner, and release checklist pointer remain.
- **Dependencies:** Legal Development Hierarchy, product inventory, counsel package, and enforced deployment checklist.
- **Entry gate:** The named governing decision is ratified and recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Legal Development Hierarchy, product inventory, counsel package, and enforced deployment checklist.
- **Commercial hypothesis:** Lets engineering proceed behind hard gates without confusing research with clearance.
- **Boundary:** The record remains within the governing self-custody, data, security, and scope boundaries.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** GOV-05.
- **Next action:** add in the future legal-package change.

### RISK-10 — Public legal-page/product/test synchronization

- **Record class:** Control
- **Parent capability:** PC-32 — Legal release and maintenance governance
- **Area / phase / side / type:** Legal release / V1 onward / both / deployment gate
- **Implementation maturity:** Defined or specified
- **Work authorization:** Ready but not queued
- **Purpose:** Ensure legal pages, checkout copy, product behavior, registry behavior, procedures, and tests describe the same actual service.
- **Parent user value:** Customers receive an accurately described service within supported availability.
- **Parent strategic role:** Separates internal research from legal clearance and makes legal maintenance operational.
- **Strategic-role tags:** Governance; Security/assurance
- **Current implementation:** Present legal pages and tests exist.
- **Remaining work:** The formal cross-surface release assertion and renewed-review triggers remain.
- **Dependencies:** Feature facts, counsel determination where needed, copy inventory, automated assertions, and release signoff.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Feature facts, counsel determination where needed, copy inventory, automated assertions, and release signoff.
- **Commercial hypothesis:** Contradiction blocks affected deployment.
- **Boundary:** Disclaimers cannot cure behavior outside the approved boundary.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Legal Development Hierarchy.
- **Next action:** include in V1 production-security/legal gate.

### RISK-11 — “Last updated” and “Last legally reviewed” tracking

- **Record class:** Control
- **Parent capability:** PC-32 — Legal release and maintenance governance
- **Area / phase / side / type:** Legal maintenance / V1 onward / public/internal / freshness control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Decision required
- **Purpose:** Distinguish editorial change from an actual legal review and make maintenance visible.
- **Parent user value:** Customers receive an accurately described service within supported availability.
- **Parent strategic role:** Separates internal research from legal clearance and makes legal maintenance operational.
- **Strategic-role tags:** Governance; Security/assurance
- **Current implementation:** Legal pages have ordinary version information.
- **Remaining work:** Separate legal-review metadata, cadence, owner, and stale alert do not.
- **Dependencies:** Counsel process, page inventory, structured metadata, monitor, and release test.
- **Entry gate:** The named governing decision is ratified and recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Counsel process, page inventory, structured metadata, monitor, and release test.
- **Commercial hypothesis:** Prevents false freshness signals.
- **Boundary:** A date must not imply counsel reviewed a change when they did not.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Legal Development Hierarchy.
- **Next action:** legal-package task.

### RISK-12 — Jurisdiction availability controls

- **Record class:** Control
- **Parent capability:** PC-32 — Legal release and maintenance governance
- **Area / phase / side / type:** Legal/product / V1 onward / both / market-release control
- **Implementation maturity:** Defined or specified
- **Work authorization:** Legally gated
- **Purpose:** Limit features or partners where the actual product/legal analysis does not support availability.
- **Parent user value:** Customers receive an accurately described service within supported availability.
- **Parent strategic role:** Separates internal research from legal clearance and makes legal maintenance operational.
- **Strategic-role tags:** Governance; Security/assurance
- **Current implementation:** General United States posture exists.
- **Remaining work:** Feature-level jurisdiction matrix, enforcement, copy, and tests do not.
- **Dependencies:** Counsel conclusions, customer location rule, partner coverage, privacy impact, fail-state UX, and review.
- **Entry gate:** The required counsel or formal legal determination is recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Counsel conclusions, customer location rule, partner coverage, privacy impact, fail-state UX, and review.
- **Commercial hypothesis:** Expand only where supportable.
- **Boundary:** Do not use casual IP geolocation as a complete legal control.
- **Stop rule:** Do not use casual IP geolocation as a complete legal control.
- **Source / evidence locator:** Roadmap legal labels and partner gates.
- **Next action:** gated.

---

# 11. Longer-horizon implementation doors

These are visible so the founder can understand the full product shape without
mistaking possibility for scope. Every record is **Deferred** unless a more
specific legal or evidence gate is shown.

### LH-01 — Preauthorized scheduled payments

- **Record class:** Expansion door
- **Parent capability:** PC-34 — Advanced scheduled, recurring, batch, and split payments
- **Area / phase / side / type:** Payment authority / later / payer / high-assurance door
- **Implementation maturity:** Concept only
- **Work authorization:** Legally gated
- **Purpose:** Execute bounded payments under recipient, amount, frequency, duration, and total limits set in advance.
- **Parent user value:** Payers can organize consequential obligations with less repetitive work.
- **Parent strategic role:** Preserves higher-value controlled-payment options behind explicit authority and audit gates.
- **Strategic-role tags:** Execution; Payer usability; Security/assurance
- **Current implementation:** Concept only; authorization contract/module, revocation, audit, economics, security audit, and counsel review remain.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Proven final-approval demand, V3W-01 usage, smart-account/allowance decision, formal audit, and counsel.
- **Entry gate:** The required counsel or formal legal determination is recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Proven final-approval demand, V3W-01 usage, smart-account/allowance decision, formal audit, and counsel.
- **Commercial hypothesis:** Strong automation value.
- **Boundary:** Reject any model giving ImplicitEx independent or ambiguous control.
- **Stop rule:** Reject any model giving ImplicitEx independent or ambiguous control.
- **Source / evidence locator:** Capability register subscriptions.
- **Next action:** none.

### LH-02 — Autonomous recurring execution

- **Record class:** Expansion door
- **Parent capability:** PC-34 — Advanced scheduled, recurring, batch, and split payments
- **Area / phase / side / type:** Payment authority / later / payer / automation door
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Execute valid recurring obligations without a contemporaneous wallet prompt.
- **Parent user value:** Payers can organize consequential obligations with less repetitive work.
- **Parent strategic role:** Preserves higher-value controlled-payment options behind explicit authority and audit gates.
- **Strategic-role tags:** Execution; Payer usability; Security/assurance
- **Current implementation:** No implementation; it requires the entire LH-01 authority, keeper/module, security, recovery, and support system.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** Named paid demand unmet by final approval, audited authority, revocation proof, failure handling, and counsel clearance.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Named paid demand unmet by final approval, audited authority, revocation proof, failure handling, and counsel clearance.
- **Commercial hypothesis:** Highest drainer/authority risk.
- **Boundary:** Do not use generic open-ended allowances or a unilateral ImplicitEx key.
- **Stop rule:** Do not use generic open-ended allowances or a unilateral ImplicitEx key.
- **Source / evidence locator:** Roadmap recurring-payment boundary.
- **Next action:** none.

### LH-03 — Public API

- **Record class:** Expansion door
- **Parent capability:** PC-33 — Platform APIs, teams, checkout, and recovery infrastructure
- **Area / phase / side / type:** Platform / later / business / infrastructure door
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Let customers create requests and read status from their own systems.
- **Parent user value:** Businesses can integrate or collaborate when the lightweight manual workflow no longer suffices.
- **Parent strategic role:** Preserves platform doors without prematurely accepting their permanent support burden.
- **Strategic-role tags:** Distribution/access; Payee operations; Governance
- **Current implementation:** Internal product interfaces exist.
- **Remaining work:** Public auth, schemas, versioning, quotas, docs, support, and compatibility policy do not.
- **Dependencies:** Repeated manual integration demand, stable V2 objects, tenant auth, abuse controls, and real customer use.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Repeated manual integration demand, stable V2 objects, tenant auth, abuse controls, and real customer use.
- **Commercial hypothesis:** Potential business tier.
- **Boundary:** No API until the underlying workflow and version contract are stable.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Capability register merchant/API door.
- **Next action:** none.

### LH-04 — SDK and verifier libraries

- **Record class:** Expansion door
- **Parent capability:** PC-33 — Platform APIs, teams, checkout, and recovery infrastructure
- **Area / phase / side / type:** Developer platform / later / business / integration door
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Make request creation, verification, embeds, and evidence validation safer for integrators.
- **Parent user value:** Businesses can integrate or collaborate when the lightweight manual workflow no longer suffices.
- **Parent strategic role:** Preserves platform doors without prematurely accepting their permanent support burden.
- **Strategic-role tags:** Distribution/access; Payee operations; Governance
- **Current implementation:** Internal JS libraries and fixtures exist.
- **Remaining work:** Supported packages, semantic versioning, release signing, docs, and maintenance do not.
- **Dependencies:** LH-03 demand, stable protocol, cross-runtime vectors, published packages, sample integrations, and support.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: LH-03 demand, stable protocol, cross-runtime vectors, published packages, sample integrations, and support.
- **Commercial hypothesis:** Distribution lever, not a vanity SDK.
- **Boundary:** Publish only primitives the company can maintain.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Capability register API/SDK.
- **Next action:** none.

### LH-05 — Merchant webhooks

- **Record class:** Expansion door
- **Parent capability:** PC-33 — Platform APIs, teams, checkout, and recovery infrastructure
- **Area / phase / side / type:** Platform / later / business / event-integration door
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Notify a customer system of verified request and settlement state changes.
- **Parent user value:** Businesses can integrate or collaborate when the lightweight manual workflow no longer suffices.
- **Parent strategic role:** Preserves platform doors without prematurely accepting their permanent support burden.
- **Strategic-role tags:** Distribution/access; Payee operations; Governance
- **Current implementation:** Billing webhooks are planned.
- **Remaining work:** Merchant endpoint registration, signatures, retries, replay, logs, and docs do not exist.
- **Dependencies:** V2 watcher/status, public API, stable events, delivery security, retry/replay tests, and paid demand.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2 watcher/status, public API, stable events, delivery security, retry/replay tests, and paid demand.
- **Commercial hypothesis:** Supports hosted checkout/infrastructure.
- **Boundary:** Never emit “paid” before authoritative verification.
- **Stop rule:** Never emit “paid” before authoritative verification.
- **Source / evidence locator:** Capability register API/webhooks.
- **Next action:** none.

### LH-06 — General chain indexer

- **Record class:** Expansion door
- **Parent capability:** PC-33 — Platform APIs, teams, checkout, and recovery infrastructure
- **Area / phase / side / type:** Chain infrastructure / later / internal / scaling door
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Recover external events, support broad webhooks/notifications, and query history when the minimal watcher cannot.
- **Parent user value:** Businesses can integrate or collaborate when the lightweight manual workflow no longer suffices.
- **Parent strategic role:** Preserves platform doors without prematurely accepting their permanent support burden.
- **Strategic-role tags:** Distribution/access; Payee operations; Governance
- **Current implementation:** Browser reads and a planned hash watcher cover narrow flows.
- **Remaining work:** Durable block ingestion, reorg replay, backfill, and ops do not.
- **Dependencies:** Proven recovery/query need, chain scope, cost model, replay correctness, observability, and production load evidence.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Proven recovery/query need, chain scope, cost model, replay correctness, observability, and production load evidence.
- **Commercial hypothesis:** Build once justified by consumers, not as speculative infrastructure.
- **Boundary:** The record remains within the governing self-custody, data, security, and scope boundaries.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap C1/G2 dependency.
- **Next action:** none.

### LH-07 — Push and payment notifications

- **Record class:** Expansion door
- **Parent capability:** PC-33 — Platform APIs, teams, checkout, and recovery infrastructure
- **Area / phase / side / type:** Engagement / later / payee / notification door
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Own the valuable “you got paid” moment and surface action-required exceptions.
- **Parent user value:** Businesses can integrate or collaborate when the lightweight manual workflow no longer suffices.
- **Parent strategic role:** Preserves platform doors without prematurely accepting their permanent support burden.
- **Strategic-role tags:** Distribution/access; Payee operations; Governance
- **Current implementation:** PWA exists; notification subscriptions, event source, preferences, delivery, privacy, and support do not.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** Watcher or indexer, G0 PII, opt-in, reliable events, device/browser tests, and retention signal.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Watcher or indexer, G0 PII, opt-in, reliable events, device/browser tests, and retention signal.
- **Commercial hypothesis:** Retention feature.
- **Boundary:** No spam, speculative alerts, or notification before verified state.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap G2.
- **Next action:** none.

### LH-08 — Small-team access

- **Record class:** Expansion door
- **Parent capability:** PC-33 — Platform APIs, teams, checkout, and recovery infrastructure
- **Area / phase / side / type:** Accounts / later / payee/business / collaboration door
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Let an owner, bookkeeper, or viewer share a workspace without sharing wallet credentials.
- **Parent user value:** Businesses can integrate or collaborate when the lightweight manual workflow no longer suffices.
- **Parent strategic role:** Preserves platform doors without prematurely accepting their permanent support burden.
- **Strategic-role tags:** Distribution/access; Payee operations; Governance
- **Current implementation:** Single-user hypothesis governs.
- **Remaining work:** Membership, invitation, removal, ownership transfer, roles, and audit do not.
- **Dependencies:** Multiple paying customers blocked by single-user access, G0, support capacity, and hostile auth tests.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Multiple paying customers blocked by single-user access, G0, support capacity, and hostile auth tests.
- **Commercial hypothesis:** Potential higher tier.
- **Boundary:** Avoid enterprise RBAC and never confer wallet authority through a workspace role.
- **Stop rule:** Avoid enterprise RBAC and never confer wallet authority through a workspace role.
- **Source / evidence locator:** Capability register team access.
- **Next action:** none.

### LH-09 — Owner, viewer, and preparer/reviewer roles

- **Record class:** Expansion door
- **Parent capability:** PC-33 — Platform APIs, teams, checkout, and recovery infrastructure
- **Area / phase / side / type:** Authorization / later / business / collaboration door
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Separate record visibility, payment preparation, and final wallet authorization.
- **Parent user value:** Businesses can integrate or collaborate when the lightweight manual workflow no longer suffices.
- **Parent strategic role:** Preserves platform doors without prematurely accepting their permanent support burden.
- **Strategic-role tags:** Distribution/access; Payee operations; Governance
- **Current implementation:** Role concepts exist; matrix, enforcement, UI, escalation, review, and audit do not.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** LH-08, V3W-06 demand, object-level authorization, negative tests, and live team use.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: LH-08, V3W-06 demand, object-level authorization, negative tests, and live team use.
- **Commercial hypothesis:** Higher-tier control.
- **Boundary:** Role labels cannot bypass cryptographic wallet authorization.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap team/approval doors.
- **Next action:** none.

### LH-10 — Batch payouts

- **Record class:** Expansion door
- **Parent capability:** PC-34 — Advanced scheduled, recurring, batch, and split payments
- **Area / phase / side / type:** Payouts / later / payer / controlled-payment door
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Prepare and execute many verified obligations with less repeated work.
- **Parent user value:** Payers can organize consequential obligations with less repetitive work.
- **Parent strategic role:** Preserves higher-value controlled-payment options behind explicit authority and audit gates.
- **Strategic-role tags:** Execution; Payer usability; Security/assurance
- **Current implementation:** Single transfer engine exists.
- **Remaining work:** CSV/list import, validation, screening decision, contract/sequence, recovery, and evidence do not.
- **Dependencies:** Repeated business demand, recipient controls, per-item evidence, audit, failure recovery, and economics.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Repeated business demand, recipient controls, per-item evidence, audit, failure recovery, and economics.
- **Commercial hypothesis:** Usage or higher-tier value.
- **Boundary:** Call it payouts, not payroll; never imply tax withholding.
- **Stop rule:** Call it payouts, not payroll; never imply tax withholding.
- **Source / evidence locator:** Capability register batch payouts.
- **Next action:** none.

### LH-11 — Contract-level split payments

- **Record class:** Expansion door
- **Parent capability:** PC-34 — Advanced scheduled, recurring, batch, and split payments
- **Area / phase / side / type:** Smart contracts / later / payee / routing door
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Split one incoming payment among approved wallets according to transparent rules.
- **Parent user value:** Payers can organize consequential obligations with less repetitive work.
- **Parent strategic role:** Preserves higher-value controlled-payment options behind explicit authority and audit gates.
- **Strategic-role tags:** Execution; Payer usability; Security/assurance
- **Current implementation:** Current contract routes recipient plus fee.
- **Remaining work:** Per-card split config, update authority, lifecycle, audit, and recovery do not.
- **Dependencies:** Named paid demand, governance model, new contract audit, immutable evidence, and counsel review.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Named paid demand, governance model, new contract audit, immutable evidence, and counsel review.
- **Commercial hypothesis:** Differentiating trustless feature.
- **Boundary:** Do not sacrifice contract simplicity for speculative demand.
- **Stop rule:** Do not sacrifice contract simplicity for speculative demand.
- **Source / evidence locator:** Capability register split payments.
- **Next action:** none.

### LH-12 — Accounting integration

- **Record class:** Expansion door
- **Parent capability:** PC-35 — Business integrations, analysis, white label, and incentives
- **Area / phase / side / type:** Records/integration / later / payee / workflow door
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Reduce re-entry of verified payment records into one selected accounting system.
- **Parent user value:** Operators gain one demanded adjacent capability without adopting an enterprise suite.
- **Parent strategic role:** Preserves monetization doors while protecting narrow scope and shared-core economics.
- **Strategic-role tags:** Revenue; Payee operations; Distribution/access
- **Current implementation:** CSV is V2 Core; OAuth/app review, mapping, synchronization, errors, and maintenance do not exist.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Repeated export pain, one customer-backed provider choice, stable schema, sandbox and production sync.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Repeated export pain, one customer-backed provider choice, stable schema, sandbox and production sync.
- **Commercial hypothesis:** Paid convenience.
- **Boundary:** Export first; no broad suite or tax/cost-basis claims.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Capability register accounting door.
- **Next action:** none.

### LH-13 — Broader freelancer invoicing

- **Record class:** Expansion door
- **Parent capability:** PC-35 — Business integrations, analysis, white label, and incentives
- **Area / phase / side / type:** Receivables / later / payee / product door
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Add line items, due dates, branding, recurrence, and status after simple requests prove insufficient.
- **Parent user value:** Operators gain one demanded adjacent capability without adopting an enterprise suite.
- **Parent strategic role:** Preserves monetization doors while protecting narrow scope and shared-core economics.
- **Strategic-role tags:** Revenue; Payee operations; Distribution/access
- **Current implementation:** Fixed signed request is V2 Core.
- **Remaining work:** Full invoice object, document output, taxes, recurrence, and workflow do not.
- **Dependencies:** Customers demanding invoice depth, competitor gap, bounded scope, real paid use, and support economics.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Customers demanding invoice depth, competitor gap, bounded scope, real paid use, and support economics.
- **Commercial hypothesis:** Remain lightweight.
- **Boundary:** Do not recreate Request Finance or claim accounting/tax compliance.
- **Stop rule:** Do not recreate Request Finance or claim accounting/tax compliance.
- **Source / evidence locator:** Capability register invoicing.
- **Next action:** none.

### LH-14 — Business verification and KYB partner

- **Record class:** Expansion door
- **Parent capability:** PC-35 — Business integrations, analysis, white label, and incentives
- **Area / phase / side / type:** Identity/compliance / later / payee / partner door
- **Implementation maturity:** Concept only
- **Work authorization:** Legally gated
- **Purpose:** Provide stronger organization evidence where social/domain control is inadequate.
- **Parent user value:** Operators gain one demanded adjacent capability without adopting an enterprise suite.
- **Parent strategic role:** Preserves monetization doors while protecting narrow scope and shared-core economics.
- **Strategic-role tags:** Revenue; Payee operations; Distribution/access
- **Current implementation:** No KYB provider, policy, review, storage, badge, or support workflow exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Paid demand, counsel, vendor diligence, PII/G0 controls, exact claim language, expiry, and appeals.
- **Entry gate:** The required counsel or formal legal determination is recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Paid demand, counsel, vendor diligence, PII/G0 controls, exact claim language, expiry, and appeals.
- **Commercial hypothesis:** Potential premium trust feature.
- **Boundary:** Partner result must not become an unlimited “safe business” endorsement.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Capability register verification.
- **Next action:** none.

### LH-15 — Transfer Analysis

- **Record class:** Expansion door
- **Parent capability:** PC-35 — Business integrations, analysis, white label, and incentives
- **Area / phase / side / type:** Intelligence/risk / later / payer / analysis door
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Offer a bounded, separate analysis product using deterministic evidence and approved data.
- **Parent user value:** Operators gain one demanded adjacent capability without adopting an enterprise suite.
- **Parent strategic role:** Preserves monetization doors while protecting narrow scope and shared-core economics.
- **Strategic-role tags:** Revenue; Payee operations; Distribution/access
- **Current implementation:** Preflight and warnings exist.
- **Remaining work:** Product scope, inputs, claims, provider data, evaluation, and pricing do not.
- **Dependencies:** Distinct paid demand, counsel, data-rights review, calibrated results, false-positive process, and tests.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Distinct paid demand, counsel, data-rights review, calibrated results, false-positive process, and tests.
- **Commercial hypothesis:** Separate instrument, not required portal clutter.
- **Boundary:** Never promise fraud prevention or principal protection.
- **Stop rule:** Never promise fraud prevention or principal protection.
- **Source / evidence locator:** Capability register Transfer Analysis door.
- **Next action:** none.

### LH-16 — ENS or portable subnames

- **Record class:** Expansion door
- **Parent capability:** PC-36 — Portable naming, creator tools, and discovery
- **Area / phase / side / type:** Naming / later / payee / identity door
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Make a Coin Card name portable into compatible wallets while retaining explicit route lineage and evidence.
- **Parent user value:** Recipients can distribute and contextualize payments where their customers already are.
- **Parent strategic role:** Preserves creator/network options behind namespace, privacy, moderation, and demand gates.
- **Strategic-role tags:** Distribution/access; Retention; Trust
- **Current implementation:** Internal handles exist.
- **Remaining work:** Namespace model, issuer, gas, ownership, renewal, disputes, recovery, and wallet support do not.
- **Dependencies:** ENS resolution demand, namespace governance, counsel/trademark policy, cost model, and pilot.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: ENS resolution demand, namespace governance, counsel/trademark policy, cost model, and pilot.
- **Commercial hypothesis:** Potential paid identity benefit.
- **Boundary:** Do not duplicate ENS merely for novelty or imply name ownership is identity.
- **Stop rule:** Do not duplicate ENS merely for novelty or imply name ownership is identity.
- **Source / evidence locator:** Roadmap A2 and naming analysis.
- **Next action:** none.

### LH-17 — CMS and commerce plugins

- **Record class:** Expansion door
- **Parent capability:** PC-36 — Portable naming, creator tools, and discovery
- **Area / phase / side / type:** Distribution / later / payee / integration door
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Let nontechnical operators add payment requests/cards to WordPress, Shopify, or another proven channel.
- **Parent user value:** Recipients can distribute and contextualize payments where their customers already are.
- **Parent strategic role:** Preserves creator/network options behind namespace, privacy, moderation, and demand gates.
- **Strategic-role tags:** Distribution/access; Retention; Trust
- **Current implementation:** Static embed exists; plugin packages, platform policy review, updates, security, store review, and support do not.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** Concentrated placement demand on one platform, stable embed/API, maintenance capacity, and live installs.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Concentrated placement demand on one platform, stable embed/API, maintenance capacity, and live installs.
- **Commercial hypothesis:** Distribution lever.
- **Boundary:** Select one platform; stop if ecosystem maintenance overwhelms customer value.
- **Stop rule:** Select one platform; stop if ecosystem maintenance overwhelms customer value.
- **Source / evidence locator:** Capability register CMS plugins.
- **Next action:** none.

### LH-18 — Opt-in directory

- **Record class:** Expansion door
- **Parent capability:** PC-36 — Portable naming, creator tools, and discovery
- **Area / phase / side / type:** Discovery / later / payee / network door
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Help people discover participating cards and potentially create network value beyond isolated URLs.
- **Parent user value:** Recipients can distribute and contextualize payments where their customers already are.
- **Parent strategic role:** Preserves creator/network options behind namespace, privacy, moderation, and demand gates.
- **Strategic-role tags:** Distribution/access; Retention; Trust
- **Current implementation:** Public cards exist; opt-in publication, search, moderation, reporting, ranking, sanctions policy, and terms do not.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** Meaningful card population, discovery demand, moderation capacity, legal/risk controls, and abuse pilot.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Meaningful card population, discovery demand, moderation capacity, legal/risk controls, and abuse pilot.
- **Commercial hypothesis:** Potential acquisition/network feature.
- **Boundary:** Do not curate a directory before staffing its abuse surface.
- **Stop rule:** Do not curate a directory before staffing its abuse surface.
- **Source / evidence locator:** Capability register directory.
- **Next action:** none.

### LH-19 — Creator goals and tipping presets

- **Record class:** Expansion door
- **Parent capability:** PC-36 — Portable naming, creator tools, and discovery
- **Area / phase / side / type:** Creator payments / later / payee / conversion door
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Offer opt-in target progress and useful payment amounts for validated creator use cases.
- **Parent user value:** Recipients can distribute and contextualize payments where their customers already are.
- **Parent strategic role:** Preserves creator/network options behind namespace, privacy, moderation, and demand gates.
- **Strategic-role tags:** Distribution/access; Retention; Trust
- **Current implementation:** Open/fixed amounts are planned.
- **Remaining work:** Goal data, denominators, reset, privacy, display, and experiments do not.
- **Dependencies:** Creator segment traction, accurate chain/request data, opt-in, privacy, and measured conversion lift.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Creator segment traction, accurate chain/request data, opt-in, privacy, and measured conversion lift.
- **Commercial hypothesis:** Creator-focused retention.
- **Boundary:** Do not let gamification obscure fees or create false urgency.
- **Stop rule:** Do not let gamification obscure fees or create false urgency.
- **Source / evidence locator:** Capability register goals/presets.
- **Next action:** none.

### LH-20 — Supporter counts and public tallies

- **Record class:** Expansion door
- **Parent capability:** PC-36 — Portable naming, creator tools, and discovery
- **Area / phase / side / type:** Creator payments / later / public / social-proof door
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Show opt-in support activity where it demonstrably helps creators.
- **Parent user value:** Recipients can distribute and contextualize payments where their customers already are.
- **Parent strategic role:** Preserves creator/network options behind namespace, privacy, moderation, and demand gates.
- **Strategic-role tags:** Distribution/access; Retention; Trust
- **Current implementation:** No privacy-safe tally, deduplication, attribution, or display controls exist.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** LH-19 demand, privacy review, opt-in, address aggregation rules, accuracy tests, and customer evidence.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: LH-19 demand, privacy review, opt-in, address aggregation rules, accuracy tests, and customer evidence.
- **Commercial hypothesis:** Never publish sender behavior by default or imply unique humans from wallet addresses.
- **Boundary:** The record remains within the governing self-custody, data, security, and scope boundaries.
- **Stop rule:** Never publish sender behavior by default or imply unique humans from wallet addresses.
- **Source / evidence locator:** Roadmap B3 caveat.
- **Next action:** none.

### LH-21 — Third-party off-ramp

- **Record class:** Expansion door
- **Parent capability:** PC-37 — Regulated off-ramp, corridor, and card partnerships
- **Area / phase / side / type:** Access/partners / later / payee / regulated-partner door
- **Implementation maturity:** Concept only
- **Work authorization:** Legally gated
- **Purpose:** Let recipients convert USDC through a licensed partner to a supported bank or cash-out destination.
- **Parent user value:** Eligible users can use stablecoin value beyond the wallet through a named regulated provider.
- **Parent strategic role:** Preserves the remittance/spend endgame without crossing the custody line internally.
- **Strategic-role tags:** Distribution/access; Revenue; Governance
- **Current implementation:** No partner, corridor, KYC handoff, status, fee, or support integration exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Repeated cash-out blocker, partner diligence, counsel, corridor coverage, transparent fees, and pilot.
- **Entry gate:** The required counsel or formal legal determination is recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Repeated cash-out blocker, partner diligence, counsel, corridor coverage, transparent fees, and pilot.
- **Commercial hypothesis:** Completes selected workflows through a partner.
- **Boundary:** ImplicitEx never receives funds or promises partner availability.
- **Stop rule:** ImplicitEx never receives funds or promises partner availability.
- **Source / evidence locator:** Capability register off-ramp.
- **Next action:** none.

### LH-22 — White-label portal

- **Record class:** Expansion door
- **Parent capability:** PC-35 — Business integrations, analysis, white label, and incentives
- **Area / phase / side / type:** Platform/services / later / business / distribution door
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Offer the payment workflow under a partner brand when bespoke revenue and volume justify support.
- **Parent user value:** Operators gain one demanded adjacent capability without adopting an enterprise suite.
- **Parent strategic role:** Preserves monetization doors while protecting narrow scope and shared-core economics.
- **Strategic-role tags:** Revenue; Payee operations; Distribution/access
- **Current implementation:** Theming/hosting exist internally.
- **Remaining work:** Tenancy, contracts, branding boundaries, compliance allocation, deployment, and support do not.
- **Dependencies:** Two or three qualified paid partners, stable platform, counsel, margin, no forks, and operational SLA.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Two or three qualified paid partners, stable platform, counsel, margin, no forks, and operational SLA.
- **Commercial hypothesis:** Consulting plus platform revenue.
- **Boundary:** Decline custom forks or partners whose conduct creates unacceptable coupling.
- **Stop rule:** Decline custom forks or partners whose conduct creates unacceptable coupling.
- **Source / evidence locator:** Capability register white-label.
- **Next action:** none.

### LH-23 — Activity-linked fee discounts

- **Record class:** Expansion door
- **Parent capability:** PC-35 — Business integrations, analysis, white label, and incentives
- **Area / phase / side / type:** Pricing/rewards / later / both / commercial door
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Reward paid activity with transparent fee discounts rather than passive yield.
- **Parent user value:** Operators gain one demanded adjacent capability without adopting an enterprise suite.
- **Parent strategic role:** Preserves monetization doors while protecting narrow scope and shared-core economics.
- **Strategic-role tags:** Revenue; Payee operations; Distribution/access
- **Current implementation:** No rewards ledger, eligibility, economics, disclosure, abuse control, or legal analysis exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Stable pricing model, repeat volume, unit economics, counsel, deterministic rules, and experiment.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Stable pricing model, repeat volume, unit economics, counsel, deterministic rules, and experiment.
- **Commercial hypothesis:** Must improve retention profitably.
- **Boundary:** Avoid token points, speculative value, or complexity that destroys price clarity.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Capability register activity rewards.
- **Next action:** none.

### LH-24 — Native mobile application

- **Record class:** Expansion door
- **Parent capability:** PC-38 — Native mobile and agent access
- **Area / phase / side / type:** Mobile / later / both / platform door
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Add deeper wallet/device integration only when the PWA demonstrably blocks retention or access.
- **Parent user value:** Qualified users or systems gain a more direct interaction path.
- **Parent strategic role:** Keeps emerging access options visible without creating speculative codebases.
- **Strategic-role tags:** Distribution/access; Payer usability
- **Current implementation:** Responsive PWA exists.
- **Remaining work:** Native codebase, store policy, release/security pipeline, deep links, and maintenance do not.
- **Dependencies:** Mobile usage/retention data, explicit PWA limitation, current store-policy review, budget, and adoption.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Mobile usage/retention data, explicit PWA limitation, current store-policy review, budget, and adoption.
- **Commercial hypothesis:** Distribution/retention lever.
- **Boundary:** Do not create a permanent second codebase for prestige.
- **Stop rule:** Do not create a permanent second codebase for prestige.
- **Source / evidence locator:** Capability register native mobile.
- **Next action:** none.

### LH-25 — x402 or agent-access surface

- **Record class:** Expansion door
- **Parent capability:** PC-38 — Native mobile and agent access
- **Area / phase / side / type:** Protocol access / later / business / research door
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Let authorized software agents request or pay for bounded services if a real market forms.
- **Parent user value:** Qualified users or systems gain a more direct interaction path.
- **Parent strategic role:** Keeps emerging access options visible without creating speculative codebases.
- **Strategic-role tags:** Distribution/access; Payer usability
- **Current implementation:** No product scope, authority model, protocol integration, metering, abuse control, or customer exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Current standard verification, named paid workflow, API maturity, machine authorization, threat model, and counsel.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Current standard verification, named paid workflow, API maturity, machine authorization, threat model, and counsel.
- **Commercial hypothesis:** Emerging option only.
- **Boundary:** Do not let an agent obtain broader financial authority than its principal explicitly granted.
- **Stop rule:** Do not let an agent obtain broader financial authority than its principal explicitly granted.
- **Source / evidence locator:** Capability register x402.
- **Next action:** none.

### LH-26 — Remittance-corridor partnership

- **Record class:** Expansion door
- **Parent capability:** PC-37 — Regulated off-ramp, corridor, and card partnerships
- **Area / phase / side / type:** Partnerships / years 3–5 / both / corridor door
- **Implementation maturity:** Concept only
- **Work authorization:** Legally gated
- **Purpose:** Connect wallet settlement to licensed local bank-transfer or cash-pickup infrastructure.
- **Parent user value:** Eligible users can use stablecoin value beyond the wallet through a named regulated provider.
- **Parent strategic role:** Preserves the remittance/spend endgame without crossing the custody line internally.
- **Strategic-role tags:** Distribution/access; Revenue; Governance
- **Current implementation:** No volume case, corridor selection, partner, compliance package, economics, or integration exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Proven corridor volume, partner diligence, counsel, AML/sanctions posture, support, and controlled launch.
- **Entry gate:** The required counsel or formal legal determination is recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Proven corridor volume, partner diligence, counsel, AML/sanctions posture, support, and controlled launch.
- **Commercial hypothesis:** Potential remittance endgame.
- **Boundary:** Treat each corridor as a distinct business/compliance program.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap D3.
- **Next action:** none.

### LH-27 — Partner debit card

- **Record class:** Expansion door
- **Parent capability:** PC-37 — Regulated off-ramp, corridor, and card partnerships
- **Area / phase / side / type:** Spending/partners / years 3–5 / payee / regulated-program door
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Let eligible users spend stablecoin value through a card issued and operated by licensed partners.
- **Parent user value:** Eligible users can use stablecoin value beyond the wallet through a named regulated provider.
- **Parent strategic role:** Preserves the remittance/spend endgame without crossing the custody line internally.
- **Strategic-role tags:** Distribution/access; Revenue; Governance
- **Current implementation:** No volume, program manager, issuer, KYC, economics, support, or integration exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Partner-required volume, retention evidence, counsel, program agreement, unit economics, and pilot.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Partner-required volume, retention evidence, counsel, program agreement, unit economics, and pilot.
- **Commercial hypothesis:** Partner-only retention option.
- **Boundary:** Do not represent ImplicitEx as issuer or promise universal acceptance.
- **Stop rule:** Do not represent ImplicitEx as issuer or promise universal acceptance.
- **Source / evidence locator:** Roadmap D4.
- **Next action:** none.

### LH-28 — Hosted checkout and payment button

- **Record class:** Expansion door
- **Parent capability:** PC-33 — Platform APIs, teams, checkout, and recovery infrastructure
- **Area / phase / side / type:** Merchant distribution / later / business / platform door
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Let a merchant create a charge and direct a payer through a narrow ImplicitEx checkout or button.
- **Parent user value:** Businesses can integrate or collaborate when the lightweight manual workflow no longer suffices.
- **Parent strategic role:** Preserves platform doors without prematurely accepting their permanent support burden.
- **Strategic-role tags:** Distribution/access; Payee operations; Governance
- **Current implementation:** Coin Card embeds and request concepts exist.
- **Remaining work:** Charge API, hosted session, merchant return, webhook, versioning, support, and integration docs do not.
- **Dependencies:** Proven manual request workflow, inbound merchant demand, LH-03/05, stable charge IDs, security review, and live merchant use.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Proven manual request workflow, inbound merchant demand, LH-03/05, stable charge IDs, security review, and live merchant use.
- **Commercial hypothesis:** Infrastructure expansion after product proof.
- **Boundary:** Do not compete on generic checkout parity before the lighter operator wedge retains.
- **Stop rule:** Do not compete on generic checkout parity before the lighter operator wedge retains.
- **Source / evidence locator:** Roadmap hosted checkout/API door.
- **Next action:** none.

### LH-29 — Request-ID-emitting transfer contract

- **Record class:** Expansion door
- **Parent capability:** PC-33 — Platform APIs, teams, checkout, and recovery infrastructure
- **Area / phase / side / type:** Smart contracts/evidence / later / both / recovery architecture door
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Put a request/payment identifier in the execution event when browser hash capture is insufficient for authoritative cross-device recovery.
- **Parent user value:** Businesses can integrate or collaborate when the lightweight manual workflow no longer suffices.
- **Parent strategic role:** Preserves platform doors without prematurely accepting their permanent support burden.
- **Strategic-role tags:** Distribution/access; Payee operations; Governance
- **Current implementation:** Current deployed event has no request ID.
- **Remaining work:** V2 uses frozen intent plus captured hash and a minimal watcher. New ABI, calldata, event, migration, audit, evidence schema, and deployment do not exist.
- **Dependencies:** Demonstrated disrupted-handoff recovery failures, value exceeding migration risk, contract audit, backward verification, rollout, and live evidence.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Demonstrated disrupted-handoff recovery failures, value exceeding migration risk, contract audit, backward verification, rollout, and live evidence.
- **Commercial hypothesis:** Do not replace a proven contract for architectural neatness.
- **Boundary:** Build only if real recovery evidence requires it.
- **Stop rule:** Do not replace a proven contract for architectural neatness.
- **Source / evidence locator:** Revision 5 matching architecture.
- **Next action:** none.

---

# 12. Horizontal asset, chain, cross-chain, and wallet expansion

Horizontal work is not one generic “multi-asset” checkbox. Each asset and chain
multiplies contract, wallet, RPC, evidence, monitoring, legal, support, and
deployment responsibilities. All records are evidence-gated after vertical
USDC workflow depth.

### HX-01 — Delistable asset registry

- **Record class:** Expansion door
- **Parent capability:** PC-39 — Stablecoin asset expansion
- **Area / phase / side / type:** Asset architecture / later / both / safety foundation
- **Implementation maturity:** Concept only
- **Work authorization:** Evidence-gated
- **Purpose:** Add or disable a supported asset independently without breaking the portal or historical evidence.
- **Parent user value:** Customers can use the stablecoin their proven workflow already requires.
- **Parent strategic role:** Expands coverage only after USDC vertical value is established.
- **Strategic-role tags:** Execution; Distribution/access; Governance
- **Current implementation:** Polygon USDC is statically allowlisted.
- **Remaining work:** Versioned metadata, enable/disable policy, evidence resolution, and tests do not.
- **Dependencies:** Named second-asset demand, asset authority, decimals/contract provenance, lifecycle, rollback, and historical verifier tests.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Named second-asset demand, asset authority, decimals/contract provenance, lifecycle, rollback, and historical verifier tests.
- **Commercial hypothesis:** Required before any second asset.
- **Boundary:** Never accept arbitrary ERC-20 addresses.
- **Stop rule:** Never accept arbitrary ERC-20 addresses.
- **Source / evidence locator:** Roadmap A7 and capability register.
- **Next action:** gated.

### HX-02 — USDT support

- **Record class:** Expansion door
- **Parent capability:** PC-39 — Stablecoin asset expansion
- **Area / phase / side / type:** Assets / later / both / horizontal expansion
- **Implementation maturity:** Concept only
- **Work authorization:** Evidence-gated
- **Purpose:** Serve corridors and operators whose actual stablecoin workflow centers on globally liquid USDT.
- **Parent user value:** Customers can use the stablecoin their proven workflow already requires.
- **Parent strategic role:** Expands coverage only after USDC vertical value is established.
- **Strategic-role tags:** Execution; Distribution/access; Governance
- **Current implementation:** No USDT contract/UI/evidence/monitoring/legal implementation exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Qualified paid demand, current U.S./foreign-issuer analysis, chain selection, HX-01, full per-asset release suite, and support plan.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Qualified paid demand, current U.S./foreign-issuer analysis, chain selection, HX-01, full per-asset release suite, and support plan.
- **Commercial hypothesis:** Demand-driven coverage, not speculation.
- **Boundary:** Delist safely if legal/issuer posture or operational risk changes.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap A7 and revised USDT analysis.
- **Next action:** gated.

### HX-03 — USDT0 or U.S.-regulated Tether-product evaluation

- **Record class:** Expansion door
- **Parent capability:** PC-39 — Stablecoin asset expansion
- **Area / phase / side / type:** Assets/research / later / both / product-selection gate
- **Implementation maturity:** Concept only
- **Work authorization:** Evidence-gated
- **Purpose:** Distinguish globally dominant USDT from separately issued or bridged Tether-branded products and choose on facts.
- **Parent user value:** Customers can use the stablecoin their proven workflow already requires.
- **Parent strategic role:** Expands coverage only after USDC vertical value is established.
- **Strategic-role tags:** Execution; Distribution/access; Governance
- **Current implementation:** The strategic distinction is recorded; current network liquidity, issuer/legal status, wallet support, and demand review are not complete.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** Primary-source revalidation at decision time, counsel, customer evidence, asset registry, and test matrix.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Primary-source revalidation at decision time, counsel, customer evidence, asset registry, and test matrix.
- **Commercial hypothesis:** Never treat brand similarity as identical issuer, redemption, regulatory, or technical risk.
- **Boundary:** The record remains within the governing self-custody, data, security, and scope boundaries.
- **Stop rule:** Never treat brand similarity as identical issuer, redemption, regulatory, or technical risk.
- **Source / evidence locator:** Last-24-hours USDT/USAT correction.
- **Next action:** gated.

### HX-04 — EURC support

- **Record class:** Expansion door
- **Parent capability:** PC-39 — Stablecoin asset expansion
- **Area / phase / side / type:** Assets / later / both / horizontal expansion
- **Implementation maturity:** Concept only
- **Work authorization:** Evidence-gated
- **Purpose:** Support euro-denominated workflows where customers already transact in EURC.
- **Parent user value:** Customers can use the stablecoin their proven workflow already requires.
- **Parent strategic role:** Expands coverage only after USDC vertical value is established.
- **Strategic-role tags:** Execution; Distribution/access; Governance
- **Current implementation:** No EURC implementation or customer evidence exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Named paid demand, legal/jurisdiction review, chain liquidity, HX-01, tests, monitoring, and support.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Named paid demand, legal/jurisdiction review, chain liquidity, HX-01, tests, monitoring, and support.
- **Commercial hypothesis:** Opens euro corridors only when real workflows justify it; display equivalence is not FX conversion.
- **Boundary:** The record remains within the governing self-custody, data, security, and scope boundaries.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap A7.
- **Next action:** gated.

### HX-05 — PYUSD support

- **Record class:** Expansion door
- **Parent capability:** PC-39 — Stablecoin asset expansion
- **Area / phase / side / type:** Assets / later / both / horizontal expansion
- **Implementation maturity:** Concept only
- **Work authorization:** Evidence-gated
- **Purpose:** Serve customers explicitly requiring PYUSD within supported wallet/payment workflows.
- **Parent user value:** Customers can use the stablecoin their proven workflow already requires.
- **Parent strategic role:** Expands coverage only after USDC vertical value is established.
- **Strategic-role tags:** Execution; Distribution/access; Governance
- **Current implementation:** No integration or demand evidence exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Paid demand, issuer/contract diligence, chain support, HX-01, release suite, and unit economics.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Paid demand, issuer/contract diligence, chain support, HX-01, release suite, and unit economics.
- **Commercial hypothesis:** Do not add for logo breadth or issuer prestige.
- **Boundary:** The record remains within the governing self-custody, data, security, and scope boundaries.
- **Stop rule:** Do not add for logo breadth or issuer prestige.
- **Source / evidence locator:** Roadmap A7.
- **Next action:** gated.

### HX-06 — RLUSD support

- **Record class:** Expansion door
- **Parent capability:** PC-39 — Stablecoin asset expansion
- **Area / phase / side / type:** Assets / later / both / horizontal expansion
- **Implementation maturity:** Concept only
- **Work authorization:** Evidence-gated
- **Purpose:** Serve customers explicitly requiring RLUSD where wallet, chain, and liquidity support are proven.
- **Parent user value:** Customers can use the stablecoin their proven workflow already requires.
- **Parent strategic role:** Expands coverage only after USDC vertical value is established.
- **Strategic-role tags:** Execution; Distribution/access; Governance
- **Current implementation:** No integration or demand evidence exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Paid demand, issuer/contract diligence, chain support, HX-01, release suite, and support.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Paid demand, issuer/contract diligence, chain support, HX-01, release suite, and support.
- **Commercial hypothesis:** Asset availability alone is not a customer proposition.
- **Boundary:** The record remains within the governing self-custody, data, security, and scope boundaries.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap A7.
- **Next action:** gated.

### HX-07 — Base deployment

- **Record class:** Expansion door
- **Parent capability:** PC-40 — Chain, cross-chain, and wallet expansion
- **Area / phase / side / type:** Chains / later / both / horizontal expansion
- **Implementation maturity:** Concept only
- **Work authorization:** Evidence-gated
- **Purpose:** Reduce fees and meet USDC users already active on Base.
- **Parent user value:** Customers can use proven workflows from the networks and wallets they already use.
- **Parent strategic role:** Expands reach only after the payment-operations proposition retains on one chain.
- **Strategic-role tags:** Execution; Distribution/access; Security/assurance
- **Current implementation:** Polygon production path exists.
- **Remaining work:** Base contract, RPC, wallet, evidence, monitoring, deployment, and support do not.
- **Dependencies:** Qualified Base demand, per-chain architecture, contract/security review, six-gate release, live evidence, and rollback.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Qualified Base demand, per-chain architecture, contract/security review, six-gate release, live evidence, and rollback.
- **Commercial hypothesis:** Likely second chain, but only after vertical V2 value and demand.
- **Boundary:** Low fees alone do not justify scope multiplication.
- **Stop rule:** Low fees alone do not justify scope multiplication.
- **Source / evidence locator:** Roadmap A8.
- **Next action:** gated.

### HX-08 — Ethereum deployment

- **Record class:** Expansion door
- **Parent capability:** PC-40 — Chain, cross-chain, and wallet expansion
- **Area / phase / side / type:** Chains / later / both / horizontal expansion
- **Implementation maturity:** Concept only
- **Work authorization:** Evidence-gated
- **Purpose:** Serve high-liquidity Ethereum USDC workflows that accept higher gas costs.
- **Parent user value:** Customers can use proven workflows from the networks and wallets they already use.
- **Parent strategic role:** Expands reach only after the payment-operations proposition retains on one chain.
- **Strategic-role tags:** Execution; Distribution/access; Security/assurance
- **Current implementation:** No production Ethereum deployment/evidence path exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Paid demand exceeding cost/complexity, chain-specific fee UX, deployment/security suite, and support.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Paid demand exceeding cost/complexity, chain-specific fee UX, deployment/security suite, and support.
- **Commercial hypothesis:** Do not make Ethereum default for a cost-sensitive small-operator segment without evidence.
- **Boundary:** The record remains within the governing self-custody, data, security, and scope boundaries.
- **Stop rule:** Do not make Ethereum default for a cost-sensitive small-operator segment without evidence.
- **Source / evidence locator:** Roadmap multi-chain doors.
- **Next action:** gated.

### HX-09 — CCTP or native cross-chain USDC path

- **Record class:** Expansion door
- **Parent capability:** PC-40 — Chain, cross-chain, and wallet expansion
- **Area / phase / side / type:** Cross-chain / later / both / interoperability expansion
- **Implementation maturity:** Concept only
- **Work authorization:** Evidence-gated
- **Purpose:** Let an authenticated request be paid from another supported chain using native issuer infrastructure.
- **Parent user value:** Customers can use proven workflows from the networks and wallets they already use.
- **Parent strategic role:** Expands reach only after the payment-operations proposition retains on one chain.
- **Strategic-role tags:** Execution; Distribution/access; Security/assurance
- **Current implementation:** No attestation, burn/mint, recovery, finality, evidence, fee, or status system exists.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Two proven chain markets, current CCTP architecture, request semantics, pending-state UX, audits, and live recovery tests.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Two proven chain markets, current CCTP architecture, request semantics, pending-state UX, audits, and live recovery tests.
- **Commercial hypothesis:** Only after separate chains succeed.
- **Boundary:** Do not hide cross-chain delay or describe it as an ordinary transfer.
- **Stop rule:** Do not hide cross-chain delay or describe it as an ordinary transfer.
- **Source / evidence locator:** Roadmap A8.
- **Next action:** gated.

### HX-10 — Solana implementation

- **Record class:** Expansion door
- **Parent capability:** PC-40 — Chain, cross-chain, and wallet expansion
- **Area / phase / side / type:** Chains / later / both / platform expansion
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Serve demonstrated Solana stablecoin workflows after EVM demand and operating model are proven.
- **Parent user value:** Customers can use proven workflows from the networks and wallets they already use.
- **Parent strategic role:** Expands reach only after the payment-operations proposition retains on one chain.
- **Strategic-role tags:** Execution; Distribution/access; Security/assurance
- **Current implementation:** No Solana program, wallet, transaction, evidence, or operations implementation exists; this is a new platform path.
- **Remaining work:** The capability has no completed end-to-end implementation.
- **Dependencies:** Strong paid demand, dedicated architecture/security budget, wallet matrix, production evidence, support.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Strong paid demand, dedicated architecture/security budget, wallet matrix, production evidence, support.
- **Commercial hypothesis:** Treat as a rewrite, not a port.
- **Boundary:** Defer unless demand materially exceeds EVM opportunity cost.
- **Stop rule:** Defer unless demand materially exceeds EVM opportunity cost.
- **Source / evidence locator:** Roadmap A8.
- **Next action:** none.

### HX-11 — Embedded or passkey wallet

- **Record class:** Expansion door
- **Parent capability:** PC-40 — Chain, cross-chain, and wallet expansion
- **Area / phase / side / type:** Wallet access / later / payer / horizontal access expansion
- **Implementation maturity:** Concept only
- **Work authorization:** Legally gated
- **Purpose:** Reach users unwilling to install a conventional wallet while preserving clear self-custodial authority.
- **Parent user value:** Customers can use proven workflows from the networks and wallets they already use.
- **Parent strategic role:** Expands reach only after the payment-operations proposition retains on one chain.
- **Strategic-role tags:** Execution; Distribution/access; Security/assurance
- **Current implementation:** Injected and WalletConnect paths exist.
- **Remaining work:** Provider, account recovery, key-share authority, portability, cost, and security do not.
- **Dependencies:** Measured wallet attrition, vendor/counsel review, key-control diagram, recovery tests, data approval, and pilot.
- **Entry gate:** The required counsel or formal legal determination is recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Measured wallet attrition, vendor/counsel review, key-control diagram, recovery tests, data approval, and pilot.
- **Commercial hypothesis:** Reject any implementation that weakens the custody claim or creates opaque vendor lock-in.
- **Boundary:** The record remains within the governing self-custody, data, security, and scope boundaries.
- **Stop rule:** Reject any implementation that weakens the custody claim or creates opaque vendor lock-in.
- **Source / evidence locator:** Roadmap A10.
- **Next action:** gated.

### HX-12 — Multi-chain observability and release matrix

- **Record class:** Expansion door
- **Parent capability:** PC-40 — Chain, cross-chain, and wallet expansion
- **Area / phase / side / type:** Operations / later / internal / scaling foundation
- **Implementation maturity:** Concept only
- **Work authorization:** Evidence-gated
- **Purpose:** Keep RPCs, contracts, assets, finality, evidence, monitoring, incidents, and deployments correct per chain.
- **Parent user value:** Customers can use proven workflows from the networks and wallets they already use.
- **Parent strategic role:** Expands reach only after the payment-operations proposition retains on one chain.
- **Strategic-role tags:** Execution; Distribution/access; Security/assurance
- **Current implementation:** Polygon release discipline exists.
- **Remaining work:** Generalized chain registry, per-chain monitors, test matrix, alerts, and runbooks do not.
- **Dependencies:** Authorized second chain, stable interface contracts, automated matrix, incident drills, and live verification.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Authorized second chain, stable interface contracts, automated matrix, incident drills, and live verification.
- **Commercial hypothesis:** Mandatory before calling the product multi-chain.
- **Boundary:** No chain ships as a UI toggle without operations parity.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap multi-chain caveat.
- **Next action:** gated.

---

# 13. Commercial, customer-evidence, and operating-model implementations

Commercial decisions are implementations: they require defined inputs,
repeatable records, owners, evidence, and stop rules just as code does.

### COM-01 — Independent-operator buyer definition

- **Record class:** Commercial experiment
- **Parent capability:** PC-41 — Buyer, segment, retention, and sequencing evidence
- **Area / phase / side / type:** Positioning / V1 / payee / market hypothesis
- **Implementation maturity:** Defined or specified
- **Work authorization:** Ready but not queued
- **Purpose:** Focus on a freelancer, creator, consultant, developer, or very small agency whose finance operation is still one person.
- **Parent user value:** Product effort stays concentrated on a workflow real customers repeatedly value.
- **Parent strategic role:** Prevents user counts, competitor imitation, or horizontal breadth from replacing commercial evidence.
- **Strategic-role tags:** Governance; Revenue; Retention
- **Current implementation:** Working definition is approved.
- **Remaining work:** Qualified interviews and paid behavior have not validated it.
- **Dependencies:** V1-21/22/23, observed stablecoin workflow, repeated pain, placement, genuine use, and payment.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V1-21/22/23, observed stablecoin workflow, repeated pain, placement, genuine use, and payment.
- **Commercial hypothesis:** Narrow before expanding.
- **Boundary:** If Request's free layer or wallet/spreadsheet workflow is adequate, refine segment or job.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap buyer thesis.
- **Next action:** use in V1 recruitment.

### COM-02 — Payee-side-first product boundary

- **Record class:** Governance decision
- **Parent capability:** PC-41 — Buyer, segment, retention, and sequencing evidence
- **Area / phase / side / type:** Product strategy / V1–V2 / payee / sequencing rule
- **Implementation maturity:** Approved governing record
- **Work authorization:** Ready but not queued
- **Purpose:** Build identity, requests, matching, records, and exports for the party receiving ongoing value before payer-side controls.
- **Parent user value:** Product effort stays concentrated on a workflow real customers repeatedly value.
- **Parent strategic role:** Prevents user counts, competitor imitation, or horizontal breadth from replacing commercial evidence.
- **Strategic-role tags:** Governance; Revenue; Retention
- **Current implementation:** Governing decision exists; customer evidence remains.
- **Remaining work:** No active feature work is authorized; preserve and maintain the evidenced behavior unless a later gate opens a change.
- **Dependencies:** Payee-side cohort tracked separately, paid commitments, repeated use, and retention.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Payee-side cohort tracked separately, paid commitments, repeated use, and retention.
- **Commercial hypothesis:** Prevents two businesses from merging into an unfocused suite.
- **Boundary:** Payer controls require a separate evidence gate.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** `docs/product/product-commercial-roadmap-2026-07-30.md`.
- **Next action:** preserve in V1 evidence design.

### COM-03 — Individual monthly pricing experiment

- **Record class:** Commercial experiment
- **Parent capability:** PC-42 — Pricing, revenue, refunds, and support economics
- **Area / phase / side / type:** Pricing / V2 / payee / commercial experiment
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Test an affordable identity/request/records workspace below enterprise pricing.
- **Parent user value:** The buyer knows what service they purchased and is not charged for hidden or commodity value.
- **Parent strategic role:** Makes lower price an economic advantage rather than a race to the bottom.
- **Strategic-role tags:** Revenue; Support/operations; Governance
- **Current implementation:** Provisional $9–$19 monthly band exists.
- **Remaining work:** Bundle, exact price, limits, billing, and evidence do not.
- **Dependencies:** V1 willingness to pay, V2 Core scope, V2C-01, conversion, retention, support, and margin.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V1 willingness to pay, V2 Core scope, V2C-01, conversion, retention, support, and margin.
- **Commercial hypothesis:** Price is not the only thesis.
- **Boundary:** Do not underprice support or call a temporary pilot waiver a free tier.
- **Stop rule:** Do not underprice support or call a temporary pilot waiver a free tier.
- **Source / evidence locator:** Roadmap pricing bands.
- **Next action:** gated.

### COM-04 — Small-operator monthly pricing experiment

- **Record class:** Commercial experiment
- **Parent capability:** PC-42 — Pricing, revenue, refunds, and support economics
- **Area / phase / side / type:** Pricing / V2 / payee / commercial experiment
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Test a $25–$49 tier for operators needing more workflow and volume but no finance department.
- **Parent user value:** The buyer knows what service they purchased and is not charged for hidden or commodity value.
- **Parent strategic role:** Makes lower price an economic advantage rather than a race to the bottom.
- **Strategic-role tags:** Revenue; Support/operations; Governance
- **Current implementation:** Band exists; qualifying capabilities, usage limits, support level, billing, and evidence do not.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** V2 Core, repeated operational use, clear tier distinction, paid conversion, retention, and margin.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2 Core, repeated operational use, clear tier distinction, paid conversion, retention, and margin.
- **Commercial hypothesis:** Stay far below $250 enterprise territory because ImplicitEx intentionally omits its machinery.
- **Boundary:** The record remains within the governing self-custody, data, security, and scope boundaries.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap pricing bands.
- **Next action:** gated.

### COM-05 — Fixed managed-request fee experiment

- **Record class:** Commercial experiment
- **Parent capability:** PC-42 — Pricing, revenue, refunds, and support economics
- **Area / phase / side / type:** Pricing / V2 / payee or payer / usage experiment
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Serve occasional users who reject a subscription but value a structured request/evidence event.
- **Parent user value:** The buyer knows what service they purchased and is not charged for hidden or commodity value.
- **Parent strategic role:** Makes lower price an economic advantage rather than a race to the bottom.
- **Strategic-role tags:** Revenue; Support/operations; Governance
- **Current implementation:** Concept exists; buyer, fee, inclusion, cap, billing, refund, and experiment do not.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** V2 Core, explicit service bundle, customer choice, completion records, fee objection and margin.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V2 Core, explicit service bundle, customer choice, completion records, fee objection and margin.
- **Commercial hypothesis:** Charge for managed work, not commodity transfer value.
- **Boundary:** Do not make the sender subsidize hidden payee benefits.
- **Stop rule:** Do not make the sender subsidize hidden payee benefits.
- **Source / evidence locator:** Roadmap pricing hypotheses.
- **Next action:** gated.

### COM-06 — Hybrid or included-volume pricing

- **Record class:** Commercial experiment
- **Parent capability:** PC-42 — Pricing, revenue, refunds, and support economics
- **Area / phase / side / type:** Pricing / later V2 / payee / commercial experiment
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Combine a low workspace fee with included usage or bounded overage when behavior supports it.
- **Parent user value:** The buyer knows what service they purchased and is not charged for hidden or commodity value.
- **Parent strategic role:** Makes lower price an economic advantage rather than a race to the bottom.
- **Strategic-role tags:** Revenue; Support/operations; Governance
- **Current implementation:** Concept only; included unit, overage, metering, entitlement, disclosure, and economics do not.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** Subscription and usage data, support costs, customer comprehension, billing reliability, and margin.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Subscription and usage data, support costs, customer comprehension, billing reliability, and margin.
- **Commercial hypothesis:** Consider only when simpler pricing fails for a known reason; avoid a confusing miniature enterprise tariff.
- **Boundary:** The record remains within the governing self-custody, data, security, and scope boundaries.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap pricing doctrine.
- **Next action:** gated.

### COM-07 — Deployed 1% fee reassessment

- **Record class:** Commercial experiment
- **Parent capability:** PC-42 — Pricing, revenue, refunds, and support economics
- **Area / phase / side / type:** Pricing/contract / V1–V2 / sender / legacy hypothesis
- **Implementation maturity:** Defined or specified
- **Work authorization:** Decision required
- **Purpose:** Decide whether the v1 contract fee remains, is capped/fixed, is absorbed by a subscription, or is replaced.
- **Parent user value:** The buyer knows what service they purchased and is not charged for hidden or commodity value.
- **Parent strategic role:** Makes lower price an economic advantage rather than a race to the bottom.
- **Strategic-role tags:** Revenue; Support/operations; Governance
- **Current implementation:** Contract charges uncapped 1%; portal reaches at most 2.50 USDC. No evidence shows it is the right suite-wide model.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** Paid workflow evidence, buyer/payer analysis, bypass behavior, fee objections, contract migration/security, and economics.
- **Entry gate:** The named governing decision is ratified and recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Paid workflow evidence, buyer/payer analysis, bypass behavior, fee objections, contract migration/security, and economics.
- **Commercial hypothesis:** Do not build features merely to defend it or remove it merely to neutralize an objection.
- **Boundary:** The record remains within the governing self-custody, data, security, and scope boundaries.
- **Stop rule:** Do not build features merely to defend it or remove it merely to neutralize an objection.
- **Source / evidence locator:** Roadmap fee-state doctrine.
- **Next action:** collect evidence only.

### COM-08 — ImplicitEx service-fee refund policy

- **Record class:** Commercial experiment
- **Parent capability:** PC-42 — Pricing, revenue, refunds, and support economics
- **Area / phase / side / type:** Support/pricing / V1–V2 / both / bounded service policy
- **Implementation maturity:** Defined or specified
- **Work authorization:** Decision required
- **Purpose:** Define when ImplicitEx may refund its own fee if the promised service was not delivered.
- **Parent user value:** The buyer knows what service they purchased and is not charged for hidden or commodity value.
- **Parent strategic role:** Makes lower price an economic advantage rather than a race to the bottom.
- **Strategic-role tags:** Revenue; Support/operations; Governance
- **Current implementation:** Principal reimbursement is excluded.
- **Remaining work:** A narrow fee-refund definition, authority, evidence, abuse limits, and accounting do not.
- **Dependencies:** Defined paid service, counsel/terms review, support procedure, logs, and tested cases.
- **Entry gate:** The named governing decision is ratified and recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Defined paid service, counsel/terms review, support procedure, logs, and tested cases.
- **Commercial hypothesis:** A fee refund is not principal-loss protection, insurance, gas reimbursement, or transfer reversal.
- **Boundary:** The record remains within the governing self-custody, data, security, and scope boundaries.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap reimbursement-language correction.
- **Next action:** V1 support/legal decision if a fee is charged.

### COM-09 — $25,000 revenue-objective dashboard

- **Record class:** Commercial experiment
- **Parent capability:** PC-42 — Pricing, revenue, refunds, and support economics
- **Area / phase / side / type:** Business operations / V1–V2 / internal / objective tracking
- **Implementation maturity:** Defined or specified
- **Work authorization:** Decision required
- **Purpose:** Keep offer volume, paid conversions, realized revenue, refunds, support cost, and remaining gap visible.
- **Parent user value:** The buyer knows what service they purchased and is not charged for hidden or commodity value.
- **Parent strategic role:** Makes lower price an economic advantage rather than a race to the bottom.
- **Strategic-role tags:** Revenue; Support/operations; Governance
- **Current implementation:** Objective and strategic requirement exist.
- **Remaining work:** Source data, dashboard/worksheet, cadence, and owner do not.
- **Dependencies:** Offer/billing records, recognized-revenue rule, refunds, costs, monthly review, and source links.
- **Entry gate:** The named governing decision is ratified and recorded.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Offer/billing records, recognized-revenue rule, refunds, costs, monthly review, and source links.
- **Commercial hypothesis:** Revenue is evidence, not registrations.
- **Boundary:** Do not count waived, founder-funded, or uncollected amounts.
- **Stop rule:** Do not count waived, founder-funded, or uncollected amounts.
- **Source / evidence locator:** Roadmap $25,000 objective.
- **Next action:** define with V1 offer tracker, without starting V2 billing.

### COM-10 — Retention and repeated-use measurement

- **Record class:** Commercial experiment
- **Parent capability:** PC-41 — Buyer, segment, retention, and sequencing evidence
- **Area / phase / side / type:** Customer evidence / V1–V2 / payee / adoption metric
- **Implementation maturity:** Defined or specified
- **Work authorization:** Ready but not queued
- **Purpose:** Distinguish one-time curiosity from a payment workspace customers depend on.
- **Parent user value:** Product effort stays concentrated on a workflow real customers repeatedly value.
- **Parent strategic role:** Prevents user counts, competitor imitation, or horizontal breadth from replacing commercial evidence.
- **Strategic-role tags:** Governance; Revenue; Retention
- **Current implementation:** Working thresholds exist.
- **Remaining work:** Cohort definitions, repeat-action events, reasons, and review do not.
- **Dependencies:** Qualified customers, privacy-approved event records, repeated placement/request/payment behavior, and interviews.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Qualified customers, privacy-approved event records, repeated placement/request/payment behavior, and interviews.
- **Commercial hypothesis:** Repeat voluntary use is stronger than a single paid test.
- **Boundary:** Avoid vanity account counts.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap working thresholds.
- **Next action:** include in V1 evidence repository.

### COM-11 — Support-burden tracking

- **Record class:** Commercial experiment
- **Parent capability:** PC-42 — Pricing, revenue, refunds, and support economics
- **Area / phase / side / type:** Operations/economics / V1 onward / internal / cost metric
- **Implementation maturity:** Defined or specified
- **Work authorization:** Ready but not queued
- **Purpose:** Measure founder minutes, incident type, recurrence, resolution, and customer impact by capability.
- **Parent user value:** The buyer knows what service they purchased and is not charged for hidden or commodity value.
- **Parent strategic role:** Makes lower price an economic advantage rather than a race to the bottom.
- **Strategic-role tags:** Revenue; Support/operations; Governance
- **Current implementation:** Support risks are described.
- **Remaining work:** A consistent tracker and review cadence do not exist.
- **Dependencies:** Support workflow, privacy-safe case IDs, time categories, monthly review, and product-action linkage.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Support workflow, privacy-safe case IDs, time categories, monthly review, and product-action linkage.
- **Commercial hypothesis:** Low overhead is an advantage only if support stays bounded.
- **Boundary:** Productize or remove recurrent bespoke work.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap unit economics.
- **Next action:** add before pilot support.

### COM-12 — Competitor and standards parity refresh

- **Record class:** Commercial experiment
- **Parent capability:** PC-41 — Buyer, segment, retention, and sequencing evidence
- **Area / phase / side / type:** Market intelligence / all phases / internal / decision input
- **Implementation maturity:** Concept only
- **Work authorization:** Deferred
- **Purpose:** Revalidate Coinbase, Request, ENS, ERC-681, Safe, partner, wallet, and policy facts when choosing a capability.
- **Parent user value:** Product effort stays concentrated on a workflow real customers repeatedly value.
- **Parent strategic role:** Prevents user counts, competitor imitation, or horizontal breadth from replacing commercial evidence.
- **Strategic-role tags:** Governance; Revenue; Retention
- **Current implementation:** July 2026 teardown exists; time-sensitive facts must be rechecked from primary sources at each relevant gate.
- **Remaining work:** Implement and validate the capability only when its work authorization permits it.
- **Dependencies:** Named decision, current primary documentation, dated comparison, impact on scope, and source links.
- **Entry gate:** A later governing roadmap decision explicitly opens this work.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Named decision, current primary documentation, dated comparison, impact on scope, and source links.
- **Commercial hypothesis:** Competitors prove demand and table stakes; they are not a clause library or a substitute for customer evidence.
- **Boundary:** The record remains within the governing self-custody, data, security, and scope boundaries.
- **Stop rule:** Stop or defer if the stated boundary cannot be maintained or the required evidence fails.
- **Source / evidence locator:** Roadmap competitor matrix.
- **Next action:** none until decision.

### COM-13 — Vertical-depth-before-horizontal-expansion rule

- **Record class:** Governance decision
- **Parent capability:** PC-41 — Buyer, segment, retention, and sequencing evidence
- **Area / phase / side / type:** Strategy / all phases / internal / sequencing control
- **Implementation maturity:** Approved governing record
- **Work authorization:** Ready but not queued
- **Purpose:** Make one USDC workflow comprehensive before multiplying assets, chains, and wallet variants.
- **Parent user value:** Product effort stays concentrated on a workflow real customers repeatedly value.
- **Parent strategic role:** Prevents user counts, competitor imitation, or horizontal breadth from replacing commercial evidence.
- **Strategic-role tags:** Governance; Revenue; Retention
- **Current implementation:** Governing decision exists; enforcement depends on preserving HX gates in every planning/release artifact.
- **Remaining work:** No active feature work is authorized; preserve and maintain the evidenced behavior unless a later gate opens a change.
- **Dependencies:** V1/V2 customer value, stable operations, named paid horizontal demand, and explicit opportunity-cost review.
- **Entry gate:** The preceding critical-path package and all named dependencies are complete.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: V1/V2 customer value, stable operations, named paid horizontal demand, and explicit opportunity-cost review.
- **Commercial hypothesis:** Coverage does not create differentiation.
- **Boundary:** Reject expansion whose main evidence is “the asset/chain is popular. ”
- **Stop rule:** Reject expansion whose main evidence is “the asset/chain is popular.
- **Source / evidence locator:** `docs/product/product-commercial-roadmap-2026-07-30.md`.
- **Next action:** enforce.

### COM-14 — Payee-side versus payer-side business review

- **Record class:** Governance decision
- **Parent capability:** PC-41 — Buyer, segment, retention, and sequencing evidence
- **Area / phase / side / type:** Strategy / V2–V3 / both / market gate
- **Implementation maturity:** Defined or specified
- **Work authorization:** Evidence-gated
- **Purpose:** Decide whether outbound controls form a second paid product rather than casually expanding the payee workspace.
- **Parent user value:** Product effort stays concentrated on a workflow real customers repeatedly value.
- **Parent strategic role:** Prevents user counts, competitor imitation, or horizontal breadth from replacing commercial evidence.
- **Strategic-role tags:** Governance; Revenue; Retention
- **Current implementation:** Distinction is documented.
- **Remaining work:** Separate payer evidence, offer, economics, and priority review do not exist.
- **Dependencies:** Successful payee core, payer-side interviews, repeated outbound pain, willingness to pay, and capacity.
- **Entry gate:** The customer or operating evidence stated in this record is present.
- **Completion evidence:** Completion requires the dependencies and evidence stated here: Successful payee core, payer-side interviews, repeated outbound pain, willingness to pay, and capacity.
- **Commercial hypothesis:** Do not combine two buyers before one wedge retains.
- **Boundary:** Payer experiments remain separately labeled and measured.
- **Stop rule:** Do not combine two buyers before one wedge retains.
- **Source / evidence locator:** Roadmap buyer/payer analysis.
- **Next action:** gated.

---

# 14. Explicit exclusions and standing “no” register

Every row below is a complete exclusion record with status **Excluded**:
nothing is authorized, no implementation is considered missing, and the next
action is **none**. The “reopen only if” column is the entry gate. Completion
evidence is continued absence from releases, copy, contracts, partner flows,
and sales commitments. Commercial role: each exclusion protects the focused,
wallet-neutral, self-custodial small-operator thesis and preserves founder
capacity.

| ID | Excluded implementation | Why it was considered / value it might offer | Boundary and reason excluded | Reopen only if |
|---|---|---|---|---|
| EX-01 | ImplicitEx custody | Smoother balances and managed settlement | Holding or independently controlling customer value changes the company and risk posture | A deliberate funded regulated-company decision with counsel, licenses, capital, staff, and new roadmap |
| EX-02 | ImplicitEx-controlled wallet keys or key shares | Invisible wallet experience and automation | Weakens self-custody and may create unilateral financial authority | A separate counsel-reviewed custody strategy is explicitly approved |
| EX-03 | Customer balances or pooled funds | Stored-value convenience and float | Requires ledger, safeguarding, reconciliation, redemption, compliance, and insolvency controls | Same deliberate regulated-company crossing as EX-01 |
| EX-04 | First-party fiat conversion | Seamless dollar-to-USDC experience | ImplicitEx would receive/convert value rather than refer to a licensed partner | A funded licensing strategy replaces the partner model |
| EX-05 | Independent payment initiation by ImplicitEx | True automation | Crosses the authority tripwire and creates security/drainer risk | A separately audited and counsel-cleared bounded authority model is approved |
| EX-06 | Generic open-ended allowance pulls | Easy recurring collection | Top drainer pattern; scope and revocation are too broad | Never under the current architecture; bounded smart-account authorization is evaluated instead |
| EX-07 | Human-arbitrated escrow | Freelancer protection and dispute resolution | Control over release and dispute expectations change custody/operating risk | A separate funded, counsel-led escrow business is approved |
| EX-08 | First-party escrow generally | Conditional settlement | Stuck funds, release authority, contract risk, and support burden exceed the thesis | Only a tightly bounded no-human-control design after named demand and counsel |
| EX-09 | Principal-loss guarantee or reimbursement | Strong payer assurance | Becomes risk transfer/insurance-like and creates claims, reserves, fraud, and legal exposure | A licensed/partner-backed protection product with capital and counsel |
| EX-10 | Insurance product | Transfer protection and confidence | Different regulated underwriting and claims business | A licensed insurance partner and separate approved product |
| EX-11 | Guaranteed, protected, risk-free, or insured payment claims | Marketing reassurance | Verification and evidence do not guarantee outcomes | Only when an actual legally reviewed protection product exists |
| EX-12 | Lending | Yield or liquidity revenue | Credit, counterparty, collection, custody, disclosure, and securities risks are off-thesis | A separate funded regulated credit strategy |
| EX-13 | Credit or cash advances | Customer liquidity | Underwriting, collections, lending laws, capital, and loss reserves are outside scope | Same as EX-12 |
| EX-14 | Passive stablecoin yield | Retention and spread revenue | Legally hostile/uncertain, requires additional asset risk, and contradicts boring-safe payments | Materially favorable enacted law plus counsel and a new risk thesis |
| EX-15 | Staking-as-a-service | Reward revenue | Off-thesis asset platform with enforcement, custody, and market-risk adjacency | A future company-level thesis change, not a feature request |
| EX-16 | ImplicitEx token | Fundraising and incentives | Turns users into speculators and contradicts flat, transparent, no-games trust | Clear enacted framework plus a user-serving need that survives hostile review |
| EX-17 | NFTs as a product direction | Membership, receipts, creator sales | Perception and complexity exceed utility for the target user | A sub-one-week isolated experiment with explicit customer demand |
| EX-18 | RWA or tokenized receivables | Invoice factoring and institutional upside | Squarely securities territory requiring partners, gating, and another company model | Funded, counsel-led year-4/5 program |
| EX-19 | First-party stablecoin issuance | Reserve-spread economics | Requires issuer authorization, reserves, capital, redemption, examinations, and new company | Year-5-plus funded issuer strategy approved separately |
| EX-20 | Payroll compliance, withholding, or tax remittance | Complete workforce-payments service | Employment, tax, reporting, jurisdiction, and support obligations exceed scope | Licensed partners and a separate approved product |
| EX-21 | Enterprise treasury replacement | Large contracts and deep workflows | Multi-entity, procurement, SLAs, controls, and support exceed solo-founder capacity | Proven scale, team, capital, and new buyer strategy |
| EX-22 | Broad accounting suite or tax engine | Complete financial records | Entrenched domain, tax judgment, API burden, and off-thesis complexity | Never as default; exports and one demanded integration remain the path |
| EX-23 | Unsupported identity-verification claims | Stronger trust marketing | Wallet/social/domain control does not prove legal identity or safety | Exact evidence class, process, expiry, and counsel-approved claim exist |
| EX-24 | Arbitrary ERC-20 support | Broad asset coverage | Unbounded token behavior, fraud, decimals, issuer, liquidity, and test matrix | Never; only individually approved registry assets |
| EX-25 | Arbitrary CSS or hidden payment facts | Maximum customization | Enables scam lookalikes, broken accessibility, and obscured authority/fees | Never; curated themes and guarded views only |
| EX-26 | Customer-specific product forks | Consulting revenue | Destroys one product, release discipline, and maintenance economics | Never by default; a white-label configuration must remain on the shared core |
| EX-27 | Consumer trading or speculative asset platform | Larger crypto audience | Competes with wallets/exchanges and abandons payment-operations thesis | A future company thesis change |
| EX-28 | Public self-service Coin Card issuance in V1 | Fast user-count growth | Creates squatting, impersonation, moderation, and uncontrolled risk before validation | V1 gates pass and a later roadmap explicitly authorizes self-service |
| EX-29 | Public Free Coin Card tier as current policy | Acquisition | Free can create abuse and unvalidated activity without economic evidence | A measurable acquisition/conversion job and approved controls |
| EX-30 | Broad directory moderation in V1/V2 Core | Network/discovery | Creates unbounded fraud/content/sanctions labor before card demand exists | LH-18 opening conditions pass |

---

# 15. Founder review and next authorized decision

## Audited inventory snapshot

This normalized draft contains **289 roadmap records**: 259 full roadmap
records and 30 explicit exclusion records. The parent layer contains 42
capabilities and does not replace or inflate the child-record total.

### Records by class

| Record class | Count |
|---|---:|
| Capability | 38 |
| Component | 50 |
| Control | 55 |
| Operational process | 22 |
| Governance decision | 15 |
| Commercial experiment | 38 |
| Expansion door | 41 |
| Exclusion | 30 |
| **Total** | **289** |

### Full records by implementation maturity

| Implementation maturity | Count |
|---|---:|
| Concept only | 42 |
| Defined or specified | 148 |
| Partially implemented | 12 |
| Implemented and tested | 33 |
| Release-evidenced | 4 |
| Production-verified | 16 |
| Customer-validated | 0 |
| Approved governing record | 4 |
| Superseded | 0 |
| **Total full records** | **259** |

### Full records by work authorization

| Work authorization | Count |
|---|---:|
| Active change | 1 |
| Next authorized | 1 |
| Ready but not queued | 71 |
| Decision required | 11 |
| Blocked by named dependency | 0 |
| Evidence-gated | 112 |
| Legally gated | 15 |
| Deferred | 48 |
| Excluded | 0 |
| Excluded records | 30 |
| **Total roadmap records** | **289** |

### Records by phase or implementation group

| Phase or group | Count |
|---|---:|
| Governance and source authority | 7 |
| Existing production foundation | 23 |
| Shared product objects and portal model | 11 |
| Coin Card trust and execution stack | 41 |
| V1 controlled pilot | 26 |
| V2 Gate 0 | 19 |
| V2 Core | 26 |
| V2 Expansion pool | 17 |
| V3 workflow experiments | 7 |
| V3 access experiments | 15 |
| Conditional legal/risk controls | 12 |
| Longer-horizon doors | 29 |
| Horizontal expansion | 12 |
| Commercial/evidence operations | 14 |
| Explicit exclusions | 30 |
| **Total** | **289** |

### Structural audit

| Audit | Result |
|---|---:|
| Parent capabilities | 42 |
| Detailed child records | 259 |
| Exclusion records | 30 |
| Duplicate IDs | 0 |
| Orphan child records | 0 |
| Parent records with no children | 0 |
| Full records missing required normalized fields | 0 |
| Beyond-specified maturity records missing evidence locators | 0 |
| Unexpected records with no next-action classification | 0 |
| Deliberately gated/deferred records without executable next work | 175 |
| Active work packages | **1** |

## What is active now

- **WP-01 — Inventory normalization and founder approval** is the only active
  work package.
- `GOV-01` is the only full roadmap record with **Active change** authorization.
- **WP-02 — Canonical repository integration** is next authorized, but it does
  not begin during this normalization pass.

## What is explicitly not active

- V2 accounts, billing, or payment-request implementation.
- Any V2 Expansion capability.
- Any V3 workflow or access experiment.
- Any additional asset, chain, wallet architecture, on/off-ramp, directory,
  API, mobile application, or enterprise capability.
- Any exclusion in Section 14.

## Founder review questions

1. Is any material roadmap record from the product, repository, or last
   24 hours missing?
2. Is any **Production-verified**, **Release-evidenced**, or **Implemented and
   tested** maturity unsupported by its exact evidence locator?
3. Is any **Partially implemented** record actually only defined or specified?
4. Does each parent capability give the correct zoomed-out explanation of its
   children?
5. Does the eight-package V1 critical path reflect the true dependency order?
6. Are any gated or deferred records accidentally phrased as commitments?
7. Do the payee-first, vertical-first, self-custodial, and evidence-first rules
   survive at both the parent and child levels?

## Immediate decision

This founder-review draft does not authorize feature work, branch integration,
public artifact design, or deployment. The current decision is to approve or
correct the normalized inventory model.

A local, uncommitted review projection may be generated during WP-01 solely
for founder review. Committed or publishable HTML and the printable PDF must
be regenerated from reconciled canonical source after WP-02.

After approval:

1. freeze the roadmap-record, parent-capability, and critical-path model;
2. close WP-01;
3. authorize WP-02 canonical repository integration as its own evidence-
   controlled change;
4. only from reconciled canonical source, build the comprehensive HTML command
   view, parent-capability view, full child register, and printable PDF;
5. retain the existing V1 checklist as a linked subordinate worksheet.
