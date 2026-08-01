# ImplicitEx Product and Commercial Roadmap

Date: 2026-07-30
Planning horizon: August 2026–July 2027
Revision: 6 — editorial hierarchy and scanability pass
Scope: Product and commercial decisions; marketing execution excluded
Status: Master internal roadmap; not legal advice

This document governs the next year of product, market, pricing, security, and
scope decisions. It preserves useful longer-range ideas as gated doors, not
commitments.

It does not replace:

- `docs/product/mvp-roadmap.md` for historical launch and implementation status;
- `docs/product/service-model-summary.md` for the currently deployed service;
- `docs/product/coin-card/` for normative Coin Card trust contracts;
- `docs/product/product-commercial-capability-register-2026-07-30.md` for
  detailed per-capability decision records; or
- `docs/product/stablecoin-expansion-roadmap.md` for route-specific technical
  watchlist detail.

Where older documents describe a public Coin Card Free tier, automatic
horizontal expansion, or the 1% fee as the business model by itself, this
roadmap supersedes that commercial assumption.

## Executive Decision

### Business thesis

> Build the simple, affordable, self-custodial stablecoin payment workspace for
> independent operators who need more than a wallet or free invoice link, but
> do not need a finance department or enterprise treasury suite.

The initial buyer hypothesis is the recipient/operator: a freelancer,
consultant, creator, developer, micro-agency, or one-person online business
that already receives stablecoins and sometimes pays collaborators.

ImplicitEx is a **focused challenger**, not a cheaper clone: use proven
capabilities, remove enterprise complexity, serve customers the incumbent
cannot economically prioritize, and charge below the incumbent’s operating
floor only when the resulting service remains trustworthy and profitable.

### Product thesis

> Coin Card is the persistent payment identity inside a lightweight payment
> workspace. ImplicitEx turns wallet movements into named, requested, confirmed,
> searchable, and exportable business events while the customer retains custody.

Wallets move and authorize stablecoins. ImplicitEx must coordinate, validate,
match, explain, document, and preserve evidence around the payment. The transfer
is the engine, not the product.

Customer shorthand:

> **Request it. Receive it. Record it.**

Category shorthand:

> **Wallets send tokens. ImplicitEx manages payments.**

### One-year objective

Reach at least **$25,000 in annual gross revenue**, or a credible run rate toward
it, through a repeatable workflow used by customers who already make or receive
stablecoin payments.

### One-year release sequence

| Planning window | Release | Required outcome |
|---|---|---|
| Aug–Oct 2026 | **V1 — Controlled Payment Credential Pilot** | Real cards, third-party payments, trustworthy lifecycle and evidence |
| Nov 2026–Feb 2027 | **V2 — Lightweight Payment Workspace** | Paid request-to-match-to-export workflow |
| Mar–Jul 2027 | **V3 — Selected Controlled-Payment and Access Experiments** | One validated workflow experiment and one validated access experiment at most |

No version advances because the prior version is technically interesting.
Each version advances only when its usage, revenue, security, and operating
gates pass. The windows are planning ranges, not authority to bypass a gate.

### Master boundary

> ImplicitEx does not receive, hold, independently direct, guarantee, insure,
> lend, convert, or recover customer funds.

Crossing that boundary would create a different company. No feature may cross
it accidentally.

### Founder control panel

| Question | Governing answer |
|---|---|
| What is active now? | V1 controlled Coin Card pilot: ratify signed records, close production security dependencies, issue controlled credentials, place cards, and observe real payments. |
| What happens next? | Only after V1 passes: complete V2 Gate 0, then build the fixed request → authoritative match → evidence → search/export loop. |
| What is gated? | V2 Expansion runs one capability at a time. V3 may run one workflow and one access experiment at most. Assets, networks, APIs, and broader operations require named demand. |
| What is excluded? | Custody, first-party conversion, principal-loss guarantees, lending, yield, token issuance, automatic pulls, and enterprise treasury replacement. |
| What evidence changes the plan? | Placement, genuine payments, repeated complete-workflow use, paid commitments, positive direct margin, and binding security/legal results. Section 15 defines the stop conditions. |
| What is the immediate decision? | Finish V1 gates and customer evidence. Do not begin billing, V2 accounts, horizontal expansion, or V3 experiments early. |

## 1. Commercial Reset — July 30, 2026

Direct stablecoin transfer is commoditized. MetaMask, Coinbase Wallet, and
other wallets can already send USDC. ENS can resolve human-readable names.
ERC-681 can package payment instructions into links and QR codes. Request and
Coinbase already offer meaningful payment-request, invoice, status, and record
workflows.

Better presentation, names, editable routes, prefilled instructions, generic
links, QR codes, basic invoices, status pages, and saved recipients are table
stakes—not defensible propositions by themselves. ImplicitEx cannot control a
rail that users can bypass. It must earn its place by helping a small operator
accept, identify, reconcile, and manage stablecoin payments without custody.

### Surviving distinction

The candidate distinction is the combination of:

```text
Versioned route authority
        +
Frozen payment intent
        +
Authorization-time instruction and execution context
        +
Confirmed settlement evidence
        +
Independent verification
```

This is closer to a chain of custody for a payment decision than another wallet
send flow.

### What the current work has become

The original transfer work was not wasted. It produced:

- a proven Polygon USDC execution route with explicit preflight checks;
- honest transaction and uncertain-outcome handling;
- Coin Card, wallet-control, receipt, and proof foundations; and
- signed trust contracts plus disciplined deployment and test gates.

The transfer portal now enters maintenance mode except for security,
reliability, and changes required by a validated Coin Card workflow.

## 2. $25,000 Sustainability Objective

### Revenue threshold

| Period | Required gross revenue |
|---|---:|
| Year | $25,000 |
| Month | $2,083.33 |
| Week | $480.77 |
| Day | $68.49 |

The safer operating target is **$30,000–$35,000 in annual gross revenue**.
Gross revenue is not take-home income. Infrastructure, billing, legal,
security, tax, support, and acquisition costs must be tracked separately.

### Focused-challenger cost discipline

ImplicitEx has a lower fixed-cost structure than an enterprise platform, not a
zero-cost structure. The operating model must budget and measure:

- hosting, RPC, indexing, storage, backups, email, and notifications;
- monitoring, incident response, security review, and contract testing;
- billing, legal, privacy, and compliance review;
- support and assisted onboarding; and
- founder development, maintenance, and interruption time.

The advantage is the ability to serve a $9–$49 customer profitably without
funding enterprise sales, multientity accounting, dedicated account management,
or contractual service levels. Price below the incumbent’s operating floor only
when support and infrastructure margin remain positive.

### Customer-count implications

| Average monthly revenue per paying customer | Paying customers required |
|---:|---:|
| $9 | 232 |
| $19 | 110 |
| $25 | 84 |
| $49 | 43 |

A 50–150 customer business is plausible only near the middle or upper end of
the price range or with a mixed subscription, setup, and transaction model.

### Revenue paths to test

| Path | Customer or volume requirement | Strategic meaning |
|---|---:|---|
| Individual subscription | 110–232 customers at $19–$9/month | Requires efficient self-service and low support |
| Small-operator subscription | 43–84 customers at $49–$25/month | Most plausible recurring core |
| Fixed or capped usage | Determined by tested unit price | Appropriate only when the paid service is explicit |
| Assisted setup | Supplemental fixed-scope revenue | Useful early; must not become bespoke consulting |
| Transaction-only | $2.5 million fee-bearing volume × 1% | Unproven and operationally demanding |

At the current $250 soft-launch transfer cap, transaction-only revenue would
require at least 10,000 maximum-size transfers per year to reach $25,000.
The customer and painful job must determine the pricing mechanism; these are
test bands, not product commitments.

## 3. Core Customer and Problem Definition

### The four payment situations

| Sender has | Recipient wants | Current ImplicitEx fit |
|---|---|---|
| USD | USD | Poor; ordinary rails are usually easier |
| USD | USDC | Requires a licensed on-ramp partner |
| USDC | USD | Requires a licensed off-ramp partner |
| USDC | USDC | Natural market today |

USDC is often a settlement rail rather than a destination customers want to
hold indefinitely. ImplicitEx must not assume that mainstream users want to
acquire, hold, or think in USDC.

### Initial buyer hypothesis

> An independent operator who uses a self-custodial wallet to receive
> stablecoin payments from clients and occasionally pay collaborators, has
> outgrown anonymous wallet history and manually reconstructed payment
> instructions, and cannot justify a full corporate finance suite.

This operator currently has to remember what each transfer meant, verify where
funds should go, reconstruct repeat instructions, match incoming payments to
requests, detect exceptions, and explain the history later.

Strong candidates:

- used stablecoins for work in the last 90 days;
- expect at least two stablecoin payment events in the next 30 days;
- pay or receive across borders, outside banking hours, or within an onchain
  community;
- repeat payments with the same clients, contractors, contributors, or vendors;
- care about route changes, proof, disputes, or reconciliation; and
- can plausibly pay $9–$49 per month or a fixed setup fee.

### Payee-side first; payer-side second

| Candidate business | Buyer receives value from | One-year decision |
|---|---|---|
| Payee-side workspace | Payment identity, requests, incoming-payment matching, client records, reminders, history, export | Initial wedge |
| Payer-side controls | Scheduled preparation, limits, approvals, batches, contractor administration | Validate after the incoming-payment loop |

These are related but distinct businesses. Do not build both complete workflows
at once. The present sender-paid 1% may be misaligned with a payee-side buyer;
that is a pricing question to test, not a reason to distort the product.

### Immediate comparison

The primary competitor is not Cash App. It is:

> A wallet’s ordinary Send function plus a copied address, chat message,
> screenshot, spreadsheet row, and block-explorer link.

The product must beat that workflow on total coordination, uncertainty,
repeatability, or proof—not merely visual polish.

### Explicit non-targets

- ordinary domestic USD-to-USD consumers;
- wallet holders with no recurring payment workflow;
- people who must first be persuaded to acquire stablecoins;
- crypto traders and DeFi users already served by specialist tools;
- enterprises requiring a complete treasury, ERP, procurement, payroll, or
  compliance platform; and
- customers requiring custody, guarantees, credit, conversion, or recovery.

## 4. Current Product, Competitors, and the Real Gap

### Competitive boundary

| Comparator | Established table stakes | Remaining ImplicitEx test |
|---|---|---|
| ENS | Names, persistent aliases, and editable address resolution | Route lineage tied to payment-time evidence |
| Request Network / Request Finance | Signed requests, lifecycle, payment references, detection, free freelancer invoicing, and enterprise operations | A focused $9–$49 workspace between free invoicing and enterprise finance |
| Coinbase Business | Links, QR, invoices, recurring invoices, status, multi-network USDC, and optional USD settlement | Wallet-neutral self-custody plus independently verifiable evidence |
| ERC-681 | Wallet-launch URLs and QR instructions for chain, destination, token call, and amount | Authenticated envelope, lifecycle, exact intent integrity, and evidence |

Coin Card should use compatible standards where useful. For example, ERC-681
can be the wallet-launch mechanism while an ImplicitEx signed record supplies
authenticated meaning and lifecycle.

Request Finance is the most important pricing and scope benchmark. As verified
on 2026-07-30, freelancers and contractors may issue invoices and get paid for
free; its business platform begins at $250 per month billed annually and
advertises zero processing fees on stablecoin payouts. The lesson is not
“copy Request more cheaply.” It is:

> Businesses pay for operations surrounding stablecoin movement, while the
> stablecoin rail itself is expected to be free or nearly free.

ImplicitEx must be simpler, self-custodial, faster to adopt, and intentionally
incomplete relative to an enterprise finance suite. Lower price reinforces
that focus; it cannot be the only advantage.

### Commercial parity and make-or-partner map

Existing providers validate the category; parity is not differentiation.
ImplicitEx should reproduce only the subset needed for one coherent small-
operator workflow.

| Capability | One-year decision | Delivery boundary |
|---|---|---|
| Coin Card identity | Core foundation | Complete the existing stack |
| Signed requests, lifecycle, and status | V2 Core | Build directly |
| Request matching and evidence | V2 Core | Minimal watcher; no broad indexer |
| Search, exact-settlement status, and CSV | V2 Core | Build directly |
| Reminders and templates | V2 Expansion | One at a time; email only after data approval |
| Invoice management | Invoice-light fields only | Do not build accounting |
| Scheduled payment with final approval | V3 workflow candidate | Fresh wallet authorization |
| Batches and preparer/reviewer flow | Later, demand-gated | Safe may supply approval authority |
| Hosted checkout, API, and webhooks | Later | Require manual-workflow proof and inbound demand |
| Accounting integration | Later | Export first; one integration after repeated requests |
| Fiat conversion or settlement | Partner only | Licensed provider owns the regulated flow |
| Autonomous recurring execution | Not now | Separate authority, counsel, and audit gate |
| Payroll compliance, enterprise controls, and SLAs | Excluded | Different product and operating model |

Coinbase Business, BitPay, Request Finance, and Safe prove demand for links,
invoices, payouts, records, approvals, batching, and integrations. The
opportunity is not novelty. It is a smaller, wallet-neutral, self-custodial
bundle for customers those platforms serve incompletely or uneconomically.

### Current asset posture

| Asset | Current posture | One-year use |
|---|---|---|
| Polygon USDC transfer contract | Deployed and proven | Reference execution route |
| WalletConnect and injected-wallet support | Implemented | Existing wallet breadth; maintain |
| Receipt state machine and proof work | Implemented foundation | Extend into request-to-settlement evidence |
| Coin Card interface and embed | Partially implemented | Controlled pilot surface |
| Signed Coin Card trust stack | Extensively specified in canonical contracts | Ratify and close gaps; do not redesign from scratch |
| Lifecycle, revocation, and registry contracts | Specified; populated production operation remains gated | Current-route authority and fail-closed status |
| Transaction Evidence contracts | Specified | Independent proof packet foundation |
| Wallet-control challenge | Staging boundary implemented | Production pilot dependency |
| Gate 1A dependency exception | Staging-only; production prohibited | Must be removed or otherwise resolved before real issuance |

### Signed-record architecture posture

The conversational signed-record draft is not a new implementation
specification. The repository already contains the deeper Coin Card contracts
for:

- signed manifest envelopes;
- canonicalization and signature policy;
- trusted key population and rotation;
- lifecycle registry authority, record selection, and resolution;
- presentation promotion;
- execution authorization;
- route revision and registry identity; and
- transaction evidence.

The remaining strategic task is to ratify those contracts as the first
implementation of an ImplicitEx-wide signed-record primitive and document any
gap before adding payment-request, merchant-charge, verification-attestation,
or receipt record families.

## 5. Value Proposition and Claims

### Working value proposition

> For independent operators already paid in stablecoins, ImplicitEx provides a
> persistent payment identity and a controlled workspace that turns wallet
> transfers into named, organized, repeatable business events.

The first complete paid workflow is:

```text
Create request → share → receive → confirm and match → preserve → find or export
```

Its six connected capabilities are Coin Card identity, signed requests,
request status, request-to-transaction evidence, searchable history, and CSV
export. Partial, excessive, and duplicate-suspect handling remains a
demand-gated V2 Expansion.

### Value ladder

1. **Publish** — present a durable payment credential, not a naked address.
2. **Authenticate** — show which route facts and wallet-control claims are
   supported by evidence.
3. **Version** — preserve route lineage, supersession, revocation, and
   transaction-time authority.
4. **Request** — freeze recipient, asset, chain, amount, purpose, reference,
   issue time, and expiration.
5. **Authorize** — show the sender the facts entering wallet authorization.
6. **Settle** — observe submitted, confirmed, failed, or uncertain chain state.
7. **Prove** — bind the request, route version, execution context, and confirmed
   result into a portable artifact.
8. **Operate** — search, match, export, reconcile, and resolve exceptions.

The system should answer operational questions, not merely display more chain
data:

- Who paid, and which request, client, invoice, order, or purpose did it satisfy?
- Was the amount correct, partial, excessive, duplicated, or unmatched?
- Which items still require action?
- What evidence explains the conclusion?

### Claim boundaries

Permitted when supported by evidence:

- `ROUTE VERIFIED`
- `WALLET CONTROL CONFIRMED`
- `SIGNED RECORD VALID`
- `VERIFIED ON [DATE]`
- `VALID THROUGH [DATE]`

Do not claim:

- legal identity verified;
- owner verified;
- trademark ownership;
- endorsement by ImplicitEx;
- recipient honesty;
- payment safety or recoverability;
- uninterrupted access to USDC; or
- immunity from issuer, legal, sanctions, or network controls.

Also prohibit product and marketing language such as `guaranteed payment`,
`protected transfer`, `loss protection`, `insured payment`, `risk-free`, or
`we make you whole`. ImplicitEx may validate instructions, monitor
confirmation, detect exceptions, and report evidence. It does not reimburse
principal or insure an outcome.

USDC is issuer-controlled and does not intrinsically pay interest. The truthful
claim is that ImplicitEx does not take custody—not that nobody can restrict the
asset.

## 6. Strategic Shifts and Decision Doctrine

### Strategic shifts

1. **Transfer utility → payment credential and operations**
2. **Public free tier → controlled, manually issued pilot**
3. **Transaction fee → mixed, evidence-driven monetization**
4. **Broad audience and enterprise imitation → focused challenger for existing stablecoin operators**
5. **Feature novelty → standards-aware practical value**
6. **Route update and receipt → route lineage and verifiable evidence**
7. **Network breadth → USDC workflow depth**
8. **Technical completion → paid, repeated customer use**

### Decision doctrine

For every customer problem:

> Define the friction first. Choose the least legally transformative
> architecture that removes it. Cross a regulatory boundary only when the
> customer benefit is material, proven, impossible to obtain through a licensed
> partner, and deliberately approved.

Additional rules:

- Follow the sequence **buyer → painful job → service → pricing mechanism →
  implementation**.
- Do not add features to justify the deployed 1% or remove the fee merely to
  neutralize an objection.
- Do not choose transaction pricing versus subscription before identifying who
  receives the recurring value.
- Every free or waived element must serve learning, acquisition, network
  utility, conversion, or demonstration; every charge must purchase a named
  service.
- Do not position an undifferentiated “send USDC now” flow as the paid product.
  Commercial payment modes begin with a credential, request, schedule, batch,
  or another validated instruction.
- Use existing standards for transport; build added proof and lifecycle only
  where customers value the distinction.
- Do not multiply a weak workflow across assets or networks.
- Do not move a longer-range possibility into the build queue without its
  named gate.
- A feature that creates indefinite support, moderation, or compliance labor
  must carry enough revenue to fund that burden.

### Decisions that must be locked before V1 production

1. **Signed-record ratification** — confirm the existing canonical contracts
   cover the V1 claim, route facts, validity, revocation, key rotation, failure
   behavior, display contract, and evidence output.
2. **Namespace governance** — handles are revocable routing aliases, not
   property. Card ID remains the durable identity.
3. **PII posture** — set the minimal V1 collection boundary. V2 Gate 0 must
   separately authorize account, billing, request, analytics, notification, and
   support data before collection.
4. **Custody tripwires** — publish the internal conditions no feature may cross.
5. **Production security gate** — close the Gate 1A dependency exception, run
   the structured security review, and harden the delivery chain.

### Namespace policy for V1

- Reserve platform-confusion names such as support, admin, security, billing,
  verification, official, ImplicitEx, and Coin Card.
- Reserve or require proof for unmistakable commercial marks likely to confuse
  a payer.
- Do not reserve every famous or ordinary personal name. Prohibit false
  identity, endorsement, image, brand, or affiliation claims and maintain a
  complaint-and-removal process.
- Treat ordinary and ambiguous names as first-come, first-served subject to the
  abuse policy.
- Lock the canonical public domain and handle URL pattern before the first
  external embed. Card IDs remain stable even if a later alias redirects.
- Support `active`, `suspended`, `revoked`, `renamed`, `redirected`,
  `reserved`, and replacement states.
- Preserve historical evidence when an alias is changed or revoked.

## 7. Twelve-Month Vertical Product Roadmap

Timing is sequential, not a promise. A later version waits if the prior gate
does not pass.

### Portal architecture doctrine

The portal should become a powerful modular workshop, not a screen that exposes
every tool at once.

**Progressive disclosure:** The default task remains short, legible, and hard
to misuse. A summary field may open a complete detail workspace for the user who
needs it. Mobile shows the decision and next action first; evidence and advanced
controls remain available without crowding execution.

**Shared product objects:** Build features as views and actions over one
authoritative model:

| Object | Purpose |
|---|---|
| Business profile | Operator identity, preferences, billing, and approved claims |
| Contact / recipient | Counterparty context without implying verified identity |
| Coin Card | Persistent payment identity and current route |
| Payment request | Amount, purpose, reference, asset, network, expiry, and lifecycle |
| Transfer | Authorization and onchain execution state |
| Receipt / evidence packet | Request, governing route, execution context, and settlement |
| Template / schedule | Reusable instruction and timing without autonomous authority |
| Exception | Unmatched, partial, excessive, duplicate-suspect, stale, or uncertain item |

An invoice is initially a structured payment request with optional business
fields—not a second accounting engine. Every object needs a stable ID, explicit
state machine, evidence source, authorization rules, and history.

**Customization boundary:** Allow saved views, filters, columns, task-oriented
layouts, and curated presentation. Do not allow arbitrary CSS, hidden
security-critical facts, or parallel records that disagree about status.

Each expandable portal field should eventually map to one of four surfaces:
summary, detail, action, or evidence. New pages are justified by a customer
task, not by the amount of data available.

### V1 — Controlled Payment Credential Pilot

**Core claim**

> An ImplicitEx-issued Coin Card exposes a current signed payment route,
> records when wallet control was demonstrated, fails closed when lifecycle
> authority is unavailable, and preserves transaction-time evidence.

**Scope**

- manually approved, time-limited pilot entitlements;
- hosted Coin Card route with durable card ID and revocable handle;
- production wallet-control verification;
- signed manifest and independently usable verifier;
- lifecycle state, revocation, supersession, and degraded unavailable state;
- static iframe or hosted link;
- Polygon USDC only;
- current transfer execution and receipt path;
- proof packet retaining signed route and transaction-time facts; and
- operational revocation, issuance, incident, and support runbooks.

Pilot fees may be waived. This does not create a public free tier.

Initial validity hypothesis: 90 days per pilot credential. Ratify the actual
validity and reverification interval before the first issuance.

**Explicit exclusions**

- billing and automatic renewal;
- public self-service issuance;
- analytics beyond operating evidence;
- additional assets or chains;
- general directory or discovery;
- on-ramp or off-ramp;
- embedded wallet;
- arbitrary customization; and
- automatic recurring payments.

**V1 gate**

- at least 10 placed pilot cards;
- at least 3 receive genuine third-party payments;
- at least 5 placements result from no more than 50 qualified direct offers;
- verifier works without trusting a mutable live presentation response;
- unavailable registry, unknown schema, invalid signature, expired, suspended,
  revoked, or replaced state blocks payment;
- production dependency exception resolved;
- registrar, DNS, GitHub, and Firebase administration protected with
  hardware-backed multi-factor authentication where supported, plus a
  served-content integrity tripwire; and
- no unresolved critical or high-severity finding in the pilot path.

Before the first genuine pilot payment, counsel must determine whether the V1
flow requires address screening or another sanctions control. If it does, that
control becomes part of the V1 gate rather than waiting for V3.

**V1 kill criterion**

If fewer than five qualified prospects place a card after 50 direct offers,
stop feature expansion and re-interview the segment. If placed cards do not
receive genuine payments, investigate the actual use case before building
billing.

### V2 — Lightweight Payment Workspace

**Core claim**

> An independent operator can request a stablecoin payment, receive it through
> a persistent credential, bind the submitted transaction to its request,
> confirm exact settlement, and retrieve or export the evidence without
> adopting an enterprise finance suite.

#### V2 Gate 0 — Account and data foundation

Before V2 stores customer, billing, request, or private operational data, all
of the following are binding:

- authentication model;
- account recovery policy;
- tenant isolation;
- object-level authorization;
- data retention and deletion;
- backup and recovery testing;
- administrative access controls;
- audit logging;
- privacy disclosure;
- PII minimization; and
- incident-response procedure.

Gate 0 must identify the authoritative account, tenant, object IDs, state
transitions, and administrative powers. Passing functional tests without
passing Gate 0 does not authorize customer-data collection.

#### V2 matching architecture

V2 does not require a general-purpose chain indexer or a replacement transfer
contract. It requires a minimal confirmation watcher for known submitted
transactions.

An **authoritatively matched ImplicitEx payment** requires:

1. a valid signed ImplicitEx payment request;
2. the request ID frozen into the execution intent;
3. the portal recording the submitted transaction hash;
4. the watcher confirming the receipt and validating sender, recipient, asset
   contract, chain, amount, fee, transfer contract, and emitted event; and
5. the request ID, transaction hash, verified event, and evidence packet being
   stored as one immutable relationship.

Matching labels:

- **Authoritatively matched** — every condition above passes.
- **Suggested match** — an external or incompletely observed transfer resembles
  a request; an operator must confirm or reject the relationship.
- **Matching uncertain** — submission may have occurred, but wallet or browser
  handoff ended before ImplicitEx durably recorded the hash.

Amount-plus-address similarity is never authoritative. A future contract may
emit a request or payment identifier only if cross-device or interrupted-flow
recovery proves commercially necessary.

#### V2 Core — Paid Payment Operations

- account and tenant foundation;
- authentication, recovery, deletion, backup, isolation, and audit controls;
- Stripe-first billing and idempotent entitlement updates;
- failed-renewal grace period followed by downgrade or suspension, never
  deletion of historical evidence;
- fixed-amount, expiring signed request and authenticated shareable link;
- request lifecycle: `draft`, `open`, `viewed`, `paid`, `expired`, and
  `cancelled`;
- transaction-submission binding;
- minimal confirmation watcher;
- request-to-transaction evidence packet;
- exact, unmatched, failed, expired, and cancelled outcomes;
- basic search by request, counterparty, purpose, reference, date, or
  transaction hash; and
- formula-safe CSV export.

#### V2 Expansion — Retention and convenience

Build only after V2 Core is repeatedly used and the selected capability solves
a named retention or operating problem:

- contacts and recipient records;
- reusable templates;
- reminders;
- partial and overpayment handling;
- duplicate-suspect detection;
- privacy-bounded analytics;
- themes and curated customization;
- ENS, social, or domain-control claims; and
- more sophisticated exception workflows.

**Explicit exclusions**

- full KYB or legal identity verification;
- full accounting or invoicing-suite replacement;
- autonomous reconciliation decisions that cannot be traced to evidence;
- multi-chain;
- public API;
- automatic subscription pulls;
- broad directory;
- email notifications until Gate 0 and the specific communication policy are
  approved; and
- enterprise roles or treasury controls.

**V2 Core exit gate**

- every Gate 0 requirement passes;
- request-to-transaction binding survives refresh, duplicate events, provider
  failure, and a controlled uncertain-handoff test;
- only fully verified relationships receive the authoritative label;
- at least 20 active cards;
- at least 5 paid conversions or written paid pre-commitments;
- at least 3 external payers use signed request links for genuine payments;
- at least 3 customers use the complete request-to-match-to-export workflow
  repeatedly;
- a crypto/fintech legal consultation completed before public paid launch;
- billing, entitlement, cancellation, retention, and export paths verified; and
- direct support time and infrastructure cost known per account, with positive
  direct margin under the tested price.

The customer-count items are working evidence thresholds. Gate 0, evidence
integrity, legal boundaries, production reliability, and positive direct margin
are binding.

**V2 Expansion entry gate**

- V2 Core is stable and repeatedly used;
- at least three customers identify the same retention or operating problem;
- the proposed expansion has one named owner, one completion definition, and a
  support-cost estimate; and
- only one V2 Expansion capability is active at a time.

**V2 kill criterion**

If qualified users place cards but nobody pays after twenty qualified pricing
conversations, pause billing expansion. Revisit the paid outcome once; do not
discount until the signal disappears.

### V3 — Selected Controlled-Payment and Access Experiments

**Core claim**

> After V2 usage identifies the most damaging workflow and access blockers,
> ImplicitEx runs no more than one workflow experiment and one access experiment
> at the same time.

V3 is an experiment pool, not a promise to build every candidate.

#### Workflow experiment pool

| Candidate | Customer outcome | Boundary |
|---|---|---|
| Scheduled payment preparation | Prepare the correct payment at the correct time | Fresh final wallet approval; no ImplicitEx-initiated pull |
| Bounded operational intelligence | Evidence-linked search, exception explanation, or draft action | No autonomous transfer, tax/legal conclusion, or unsupported fraud verdict |

#### Access experiment pool

| Candidate | Customer outcome | Boundary |
|---|---|---|
| Embedded or return-URL request | Complete a V2 request inside another task flow | Same signed request and evidence contract |
| ERC-681 or QR/POS handoff | Reach a compatible wallet with less mobile coordination | Visible recipient, full-address access, expiry, and substitution resistance |
| Recent recipients or ENS resolution | Reduce repeat-recipient coordination | ImplicitEx events first; verified forward resolution; no identity implication |
| Fiat-equivalent display | Understand the amount in familiar terms | Timestamped display only; no conversion claim |
| Gas abstraction | Remove the need to acquire POL | Audited paymaster/smart-account boundary and funded unit economics |
| Third-party on-ramp | Acquire USDC when that is the measured blocker | Licensed partner owns KYC, conversion, fraud, and settlement |

Address screening is not a discretionary V3 product experiment when counsel
determines it is required. In that case it becomes a binding release control.
A selected experiment may add only the minimal event watcher or notification
path it needs after Gate 0; a general-purpose indexer remains a later platform
door.

#### Experiment selection rule

Before implementation, record:

- the measured V2 blocker;
- the named cohort affected;
- current baseline behavior;
- one success measure and one stop condition;
- legal, custody, privacy, security, and support dependencies; and
- the cost and time budget.

Do not begin a second experiment in the same category until the first is
completed, stopped, or explicitly returned to the pool.

**V3 gate**

- the selected experiment is used in at least three genuine customer events;
- its measured result improves the named baseline;
- support and infrastructure costs fit the offer;
- partner or paymaster economics remain transparent and funded where relevant;
  and
- all authority, trust, data, legal, privacy, and security controls pass.

Three customer events are a working evidence threshold, not market validation.
A failed experiment returns to the pool or is removed; it does not authorize a
second feature intended to conceal the failure.

### Capability phase index

The detailed four-field records live in
`docs/product/product-commercial-capability-register-2026-07-30.md`. The
master roadmap controls their phase and entry gate.

| Stage | Capability groups |
|---|---|
| **V1 active** | Modular portal objects; controlled Coin Card issuance; route lineage; proof hardening |
| **V2 Gate 0 and Core** | Account/tenant foundation; signed requests; authoritative matching; evidence/search/export; billing and entitlement |
| **V2 Expansion** | Contacts, templates, reminders, advanced exceptions, analytics, customization, and bounded claims—one at a time |
| **V3 pool** | Scheduled final approval or bounded intelligence; request embedding, QR, recent recipients/ENS, fiat display, gas abstraction, or third-party on-ramp |
| **Conditional release control** | Address screening whenever counsel determines it is required |

## 8. Horizontal and Longer-Horizon Roadmap

### One-year conditional horizontal candidates

| Candidate and status | Entry gate | Required boundary |
|---|---|---|
| Second stablecoin such as USDT/USAT — later | 3 paying or signed-pilot customers blocked by the same asset | Allowlisted registry, independent disable, issuer review, asset-specific tests and proof |
| EURC, PYUSD, or RLUSD — watchlist | Distinct paying segment, not curiosity | Same asset gate; no hardcoded symbol assumptions |
| Base — likely second EVM network, not authorized | Repeated wrong-network abandonment and paid commitments | Independent deployment, RPC, finality, gas, pause, monitoring, receipt, and rollback |
| CCTP or another cross-chain path — after a second network | Clear payer/recipient chain mismatch | Explicit attestation and timeout states; separate incident plan |
| Solana — outside the one-year plan | Demand sufficient to fund a separate runtime | Treat as a rewrite, not a port |
| Embedded/passkey wallet — later, counsel-reviewed | Existing-wallet requirement blocks paid demand | No ImplicitEx-controlled key share; vendor exit, recovery, privacy, and per-user economics |

Every asset must be delistable without breaking other routes. Every chain must
fail independently. No user may enter an arbitrary token contract.

### Scheduled-payment authority boundary

| Model | Authority | Decision |
|---|---|---|
| Prepared schedule with final approval | ImplicitEx remembers and prepares; user freshly authorizes the exact transaction | V3 experiment |
| Preauthorized smart-account module | Rules permit later execution within recipient, amount, frequency, and total limits | Later; counsel, threat model, audit, revocation, and gas abstraction required |
| ImplicitEx-controlled wallet or backend key | ImplicitEx can execute as controller | Do not build |

Smart-account modules can support recurring transactions, allowlists, rate
limits, and spending caps, but their execution power enlarges the trusted and
audited surface. “Non-custodial” is not a substitute for reviewing who can
actually initiate or control a transfer.

### Named doors after the one-year roadmap

Detailed door gates are retained in the subordinate capability register.

| Door family | Includes | Governing gate |
|---|---|---|
| Controlled outbound payments | Preauthorization, batches, splits | Proven final-approval workflow, named demand, counsel, and separate audits |
| Platform infrastructure | API, SDK, webhooks, indexer, notifications, x402 | Stable manual workflow plus funded inbound integrations or machine customers |
| Teams and approvals | Small-team access, Safe integration | Repeated payer-side demand and funded tenant/session security |
| Accounting operations | Accounting integration, broader invoicing | CSV use, retention, and repeated requests for the same next step |
| Identity and distribution | Verification, ENS, CMS plugins, directory, creator mechanics | Card/embed density, funded governance or moderation, and opt-in privacy |
| Regulated edges | Off-ramp, corridors, debit card | Proven volume, named geography, licensed partner coverage, and acceptable KYC |
| Commercial extensions | White-label, activity-linked discounts | Profitable repeatable deals or tested unit economics |
| Native application | iOS/Android application | Proven PWA usage and a platform limitation blocking retained customers |
| Bounded analysis | Deterministic transfer analysis | Enough real history to separate facts, rules, and inference reliably |

## 9. Subscription and Transaction Revenue Models

### One-year offer hypotheses

| Offer | Initial price hypothesis | What the customer buys |
|---|---:|---|
| Controlled pilot | Explicit list price; selectively waived | Evidence that willingness and placement are being tested, not a public free tier |
| Individual | $9–$19/month | Maintained route, fixed requests, status, history, and proof |
| Small operator | $25–$49/month | Authoritative matching, evidence, basic search, CSV export, exception review, and higher usage/support |
| Managed request | Fixed or capped per-request test | Occasional use without an open-ended percentage or subscription |
| Hybrid | Small monthly fee with included volume or explicit limits | Recurring operations with predictable economics |
| Assisted setup | $299–$750 fixed scope | Standard setup and workflow mapping |
| Routed transfer | Current interface: 1% fee-on-top; maximum reachable fee 2.50 USDC | Deployed execution path; buyer alignment and long-term pricing remain unproven |
| Advanced or team | Undefined | Do not price capabilities that do not yet exist |

Do not discount simply to manufacture conversion. Price response is product
evidence. The likely V2 payer is the recipient/operator receiving the ongoing
administrative value, not an unaware sender subsidizing the recipient’s records.

### Deployed fee state

These three states must never be conflated:

> **Current interface constraint:** 250 USDC maximum transfer; 2.50 USDC
> maximum reachable fee.
>
> **Current deployed contract behavior:** 1% fee without an absolute
> contract-level fee cap.
>
> **Proposed future policy:** Deploy and verify a 10 USDC absolute fee ceiling
> before increasing the supported transfer limit above 1,000 USDC.

The future fee policy is not current contract behavior. Any interface, evidence
record, or customer disclosure must derive its fee statement from the
authenticated live execution policy and the separately enforced interface
limit.

### Competitive price context

Verified on 2026-07-30:

- Request Finance’s business plan begins at $250/month billed annually while
  stablecoin payouts carry zero processing fees; its free freelancer use
  already covers basic invoicing.
- BitPay states merchant processing costs 1–2% plus $0.25 per paid invoice.
- Coinbase’s Commerce migration material identifies 1% for migrating merchants,
  while current general Coinbase Business payment fees are displayed inside
  the product rather than published as one universal public rate.

Therefore, the deployed 1% is neither unique nor automatically inexpensive.
ImplicitEx should compete through a smaller product, self-custody, rapid
adoption, transparent scope, and positive support economics—not a race to the
bottom. Fixed, capped, subscription, and hybrid pricing remain live tests.

### What customers are being asked to pay for

Every charge must map to work performed, risk reduced, or effort eliminated:

- clearer identity and authenticated payment instructions;
- payment meaning and usable records;
- matching, duplicate and amount-error detection;
- coordination, reminders, and repeatable instructions;
- exception explanation and operator-ready next steps; or
- maintained lifecycle, support, and evidence.

ImplicitEx sells payment administration, not insurance. A narrow refund of the
ImplicitEx service fee could be considered only for a separately defined
service failure with reviewed terms. It must never imply reimbursement of
principal, gas, market loss, wallet compromise, or recipient fraud.

### The 1% contract

Keep the deployed contract while testing. Officially treat the 1% as an
unproven pricing hypothesis, not a roadmap doctrine.

- Evidence value does not automatically rise with payment size, and repeat
  counterparties may bypass a percentage fee.
- A charge must purchase a named service, not a wallet transfer plus decorative
  features.
- Compare sender-paid percentage, recipient-paid subscription, flat managed
  request, and hybrid offers with the same qualified buyer.
- Revisit the contract only after customers use the complete workflow and the
  party receiving enough value to pay is known.

Track subscription, setup, transaction, and any analysis revenue separately.
Never present gross transfer volume as platform revenue.

The controlled pilot remains the V1 entry point. Any later free surface needs a
measurable acquisition, learning, network, or conversion function plus an
abuse-control model.

## 10. Do Not Build Register

“Never” means never under the current company thesis. Reconsideration requires
an explicit strategic reset, not an annual feature review.

| Excluded product or service | Decision | Reason / possible revisit |
|---|---|---|
| ImplicitEx token | Never | Converts users into speculators and destroys the “no token games” trust position |
| First-party stablecoin | Not this company plan | Issuance, reserves, redemption, supervision, capital, and AML obligations require a different funded institution |
| Custodial wallet or customer balance | Never under current thesis | Key, licensing, security, insurance, and insolvency exposure |
| Bank, exchange, or licensed money-transmission business | Not the current company | Requires deliberate capitalization, licensing, compliance staff, supervision, and a different operating model |
| First-party fiat on/off-ramp | Never under current thesis | Use licensed partners; ImplicitEx does not receive or convert funds |
| Principal-loss guarantee or reimbursement | Never | Insurance, reserves, fraud, claims, and underwriting; this does not prohibit refunding ImplicitEx’s own service fee |
| Credit, lending, cash advance, or factoring | Never | Underwriting, collections, securities/credit, and balance-sheet risk |
| Passive stablecoin yield | No | Legally sensitive, off-thesis, and an extinction-level trust risk if funds are lost |
| Staking-as-a-service | No | Asset-platform drift and enforcement/custody risk |
| NFTs or receipt NFTs | No | Perception and complexity exceed customer value |
| Tokenized receivables / RWA | No within this roadmap | Securities territory; separate funded, counsel-led business if ever |
| First-party escrow arbitration | Never | Control over release and unbounded dispute expectations |
| Automatic wallet pulls | No in current model | Changes authority and custody analysis; recurring templates may not move funds |
| Enterprise treasury replacement | No | Sales, policy controls, integrations, uptime, support, and compliance exceed scope |
| Broad accounting or tax platform | No | Export and narrow integration are the boundary |
| Consumer speculation or trading tools | Never | Contradicts payment and evidence thesis |
| Arbitrary ERC-20 support | Never | Unbounded token behavior, fraud, issuer, and testing risk |
| Unconstrained card CSS or executable customization | No | Scam lookalikes, injection, and destroyed trust consistency |
| Custom consulting disguised as product onboarding | No | Fixed-scope onboarding only; reject bespoke product forks |

Timeout-only smart-contract milestones may be researched years later, but not
described as escrow and not built without counsel and a separate security gate.

## 11. Security, Regulatory, Custody, and Privacy Boundaries

### Four-level operating ladder

| Level | Operating model | Roadmap posture |
|---|---|---|
| 1 | Non-custodial software: users control wallets and authorize transfers; ImplicitEx provides identity, instructions, records, analysis, and deterministic contracts | Current company |
| 2 | Non-custodial platform with licensed partners for fiat conversion, custody, cards, or regulated settlement | Preferred expansion |
| 3 | Custodial processor controlling keys, balances, pooled funds, timing, or transmission | Different regulated institution; do not enter |
| 4 | Stablecoin issuer with reserves, redemption, capital, liquidity, AML, and supervision | Different funded company; not a plan |

The objective is not to climb this ladder. Level 2 can deliver much of a
complete customer experience without ImplicitEx becoming the regulated holder
or transmitter. Any move to Level 3 or 4 requires a deliberate company-level
decision, funding, and specialized counsel—not a feature ticket.

### The custody line

The useful distinction is not a promise that non-custodial software is
unregulated. It is an architectural boundary:

**Current world:** The user controls the wallet, approves each transaction, and
funds move through deterministic contract instructions without ImplicitEx
holding a balance.

**Different company:** ImplicitEx accepts or holds value, controls a key or key
share, initiates pulls, controls release, converts fiat, issues an asset, pays
yield, lends, insures, or independently redirects or delays funds.

Non-custody materially reduces money-transmission risk. It does not prove that
no federal or state obligation applies.

### Custody tripwires

Stop design and require written legal and architectural review if a feature
would let ImplicitEx:

- receive or hold customer fiat or digital assets;
- maintain an off-chain customer balance;
- possess or control any wallet key or operative key share;
- initiate a transfer without fresh, transaction-specific user authorization;
- trigger an allowance-based pull as the initiating service;
- decide whether or when escrowed funds release;
- redirect, delay, recover, reverse, or substitute a recipient;
- convert fiat or assets as principal;
- issue, redeem, or promise value for an ImplicitEx asset;
- pay yield or deploy customer assets into a protocol;
- extend credit, insure loss, or guarantee settlement; or
- conceal a regulated function behind a nominally third-party interface.

### Partner principle

Use licensed partners for on-ramps, off-ramps, cards, and corridor cash-out.
The partner must actually own KYC, licensing, fraud, settlement, and
chargebacks. A contract cannot transfer away ImplicitEx’s own legal duties, so
counsel must review the real flow and user experience.

### Legal-status vocabulary

Every legal statement in product planning must be labeled:

1. **Current enacted law**
2. **Proposed implementing rule**
3. **Pending legislation**
4. **Counsel-dependent interpretation**

As of 2026-07-30:

- The GENIUS Act is enacted law; major implementation work is still proceeding
  through proposed rules.
- CLARITY / digital-asset market-structure legislation is not enacted federal
  law. No roadmap assumption may depend on current draft text becoming law
  unchanged.
- FinCEN guidance distinguishes business models using facts such as ownership,
  direct interaction, acceptance/transmission, and independent control. It is
  useful architecture guidance, not a legal opinion on ImplicitEx.
- OFAC states that sanctions penalties may use a strict-liability standard and
  recommends tailored, risk-based compliance for virtual-currency businesses.
  The exact obligations and screening design remain counsel-dependent.
- State money-transmission analysis remains fact-specific.

### PII and data posture

Decide collection by data class, not feature-by-feature:

| Data | Initial posture |
|---|---|
| Wallet address and public chain facts | Use only as needed for route, evidence, and support |
| Local recipient labels | Device-local first |
| Email | Do not collect until billing, support, or approved notifications require it |
| View analytics | Minimal and disclosed; no silent expansion from “stateless” claims |
| Social/domain verification evidence | Retain only what the claim and dispute process require |
| Billing identifiers | Keep separate from wallet authorization and public registry |
| Internal abuse or complaint evidence | Private, access-controlled, retained by policy |

On-chain memos are public and permanent. Default to off-chain structured purpose
and reference fields with explicit retention rather than encouraging public
business details onchain.

### Security review

The Fable review packet must cover:

- architecture, custody, authority, smart-contract, and administrative
  boundaries;
- wallet, account, chain, replay, and time-of-check/time-of-use behavior;
- signed records, keys, lifecycle, rollback, revocation, and evidence;
- Firebase rules/functions, privacy, logging, retention, and tenant isolation;
- dependencies, secrets, DNS, registrar, GitHub, Firebase, and deployment
  controls; and
- failure states, uncertain outcomes, incident response, and production
  runbooks.

Every finding needs severity, exploitability, affected component, reproduction,
impact, remediation, regression test, owner, and disposition.

No real pilot issuance while the Gate 1A dependency exception prohibits
production deployment.

## 12. Feature Validation and Deployment Doctrine

### Build sequence

1. **Customer problem** — observe the last real transaction and identify the
   costly or repeated job.
2. **Authority and custody analysis** — determine who can initiate, control,
   redirect, delay, or release value.
3. **Data and privacy boundary** — define the minimum data, purpose, access,
   retention, deletion, and disclosure.
4. **Architecture decision** — identify the authoritative records, state
   transitions, identities, dependencies, and recovery behavior.
5. **Threat model** — identify abuse, compromise, replay, ambiguity, outage,
   and failure cases before implementation.
6. **Commercial test** — compare alternatives and present a specific price or
   pilot commitment to the party receiving value.
7. **Smallest implementation** — build only the complete path required to test
   the defined customer outcome.
8. **Tests and evidence** — automate invariants and complete manual end-to-end,
   security, privacy, and failure-path verification.
9. **Controlled deployment** — release to an identified cohort behind the
   required gates.
10. **Production verification** — confirm live configuration, authority,
    monitoring, evidence, support, and rollback.
11. **Customer evidence** — measure use, revenue, support, failures, and
    retention; continue, revise once, defer, or stop.

### Signed-record invariants

The canonical Coin Card contracts remain authoritative. At roadmap level, every
signed record family must preserve:

- unique record type, schema version, environment, and verification domain;
- canonical serialization and atomic integer money values;
- signed route, asset, chain, amount policy, issue time, validity, and key ID;
- immutable versions; mutation creates a new version;
- revocation, suspension, expiration, supersession, and historical
  verification;
- authorized key discovery, rotation, retirement, and compromise procedure;
- replay protection and request identity where execution is involved;
- display derived from verified payload, not parallel metadata; and
- fail-closed behavior for unknown, unavailable, malformed, stale, or
  unauthenticated state.

For payment execution, only the explicit current-valid state—or a constitutionally
permitted expiring-soon state—may proceed.

### Definition of complete

A capability is not complete because code merged. Completion requires:

- customer problem, target workflow, and non-goals;
- price or revenue hypothesis;
- threat model and resolved release blockers;
- automated tests and manual end-to-end evidence;
- honest failure and uncertain-outcome behavior;
- authorization, privacy, retention, and data-export policy;
- deployment, monitoring, rollback, incident, and support procedure;
- reviewed customer-facing claims;
- use by the intended customer; and
- evidence for or against willingness to pay.

## 13. Customer Discovery and Market Evidence

### Recruit by behavior

Do not interview random people. Recruit:

- freelancers, consultants, creators, and developers already requesting
  stablecoin payment;
- micro-agencies and one-person businesses reconciling wallet receipts;
- independent operators who tried or rejected Request, an invoicing tool, or a
  spreadsheet because it was too little or too much;
- small agencies or remote teams paying contractors in stablecoins, as a
  secondary payer-side cohort;
- crypto-native communities paying contributors;
- digital sellers accepting onchain payment; and
- repeat wallet users with an actual business-payment purpose.

### Ask about the last payment

- How was the destination obtained and verified?
- Was a test payment sent?
- Which wallet, network, and asset were used?
- What could have gone wrong?
- What proof was retained?
- How did the recipient confirm arrival?
- Was the route used before or changed later?
- What happened at month-end, during a dispute, or when a bookkeeper asked?
- How did an incoming transfer get matched to the right request or client?
- How were short, duplicate, late, or unidentified payments handled?
- Which part of Request’s free freelancer workflow, if tried, was insufficient?
- Who would approve and pay for the replacement workflow?
- Would route lineage or an independently verifiable artifact have mattered?
- Which specific outcome would justify $9–$19, $25–$49, a managed-request
  charge, or a setup fee?
- Would the next genuine transaction be routed through the pilot?

Do not ask whether the broad idea sounds useful.

### Initial evidence program

1. Conduct 15 payee-side and 5 payer-side qualified workflow interviews;
   analyze them separately.
2. Make up to 50 direct pilot offers to qualified prospects.
3. Place at least 10 pilot cards.
4. Observe at least 3 genuine third-party payments.
5. Present explicit paid offers in at least 20 qualified follow-up
   conversations.
6. Seek at least 5 paid conversions or commitments during V2 Core before
   entering V2 Expansion.

Record segment, payment frequency, current tools, workflow, pain, consequence,
competitor used, asset/network, price response, security concern, next
commitment, and permission to retain the evidence.

## 14. Revenue, Usage, Retention, and Trust Metrics

### Commercial

- gross and recurring revenue by offer;
- average revenue per paying account;
- paid conversion by segment and offer;
- setup delivery time and margin;
- 30-, 60-, and 90-day retention;
- cancellation, downgrade, refund, and concentration;
- infrastructure and direct support cost per account.

### Product

- qualified offers, placements, and activated cards;
- genuine third-party payments per card;
- repeated counterparties;
- signed requests created, opened, authorized, expired, and paid;
- request-to-confirmation completion;
- exact, partial, excessive, duplicate-suspect, and unmatched outcomes;
- exceptions opened, operator-resolved, corrected, and aged;
- proof packets retrieved or shared;
- exports used;
- templates reused and reminders acted upon;
- scheduled instructions prepared, approved, cancelled, expired, and missed;
- evidence-linked questions answered and draft actions accepted or rejected;
- route changes, suspensions, revocations, and supersessions;
- founder-assisted steps per account.

### Access

- wallet-connect, gas, acquisition, wrong-network, and unsupported-asset
  abandonment;
- QR or request-link handoff success;
- on-ramp starts, KYC exits, completion, partner fees, and support issues;
- paymaster cost per successful payment.

### Trust and reliability

- invalid, expired, unavailable, mismatched, and rollback-blocked records;
- proof-to-chain mismatch count;
- submitted, confirmed, rejected, failed, interrupted, and unknown outcomes;
- unsafe retry preventions;
- RPC/provider incidents;
- security findings opened, aged, and closed;
- privacy, impersonation, trademark, and revocation cases.

Free or pilot activity matters only when it produces learning, genuine payment,
conversion, or low-cost distribution.

## 15. Assumptions, Risks, and Kill Criteria

### Threshold classes

**Binding gates** are pass/fail requirements. Failure blocks release:

- security and production reliability;
- custody and authority boundaries;
- evidence integrity;
- legal and privacy boundaries; and
- positive unit economics for a paid capability.

**Working evidence thresholds** are minimum signals for the next decision, not
statistical validation. They include three genuine payments, five paid
commitments, ten controlled cards, repeated use by three customers, and twenty
qualified conversations. They may be revised with a written reason, but never
used to bypass a binding gate.

**Business objectives** are sustained outcomes: revenue, retention, gross
margin, support burden, conversion, and usage frequency.

| Assumption or risk | Continue evidence | Kill, narrow, or pivot criterion |
|---|---|---|
| Qualified users have a route/proof problem | At least 5 of 20 interviews show repeated pain and commit to a pilot action | Fewer than 5 show the problem; stop feature work and change segment or thesis |
| Coin Card is placed and reused | At least 10 cards placed from no more than 50 qualified offers | Fewer than 5 placements from 50 offers; segment or offer is wrong |
| Placed cards produce real payments | At least 3 genuine third-party payments | Cards remain demos or self-payments; do not build billing |
| Users notice the evidence distinction | Customers use lineage/proof in a business, reconciliation, or dispute workflow | Only design, handles, or generic link convenience is valued; narrow to utility or stop the evidence thesis |
| Customers will pay | At least 5 paid conversions or commitments after 20 qualified price conversations | No one pays; revise the paid outcome once, then pause |
| A prosumer gap exists below enterprise finance software | Operators need identity, matching, records, or repeat instructions beyond free invoicing and will pay $9–$49 | Request’s free workflow or a spreadsheet already satisfies the job; narrow again or stop |
| The payee is the initial buyer | Recipients repeatedly use and pay for requests, matching, records, and export | Senders receive the meaningful value or recipients will not pay; separate the payer-side product rather than blending both |
| Lightweight reconciliation saves work | Deterministic matching handles routine receipts and the exception queue is revisited | Users ignore matching and exceptions or still reconstruct everything elsewhere |
| Bounded intelligence closes a loop | Customers use evidence-linked answers or approve prepared actions and report saved time | It produces summaries without decisions or action; remove the AI layer |
| The 1% fee can coexist with adoption | Qualified customers knowingly accept it with the complete workflow | Objections repeatedly dominate qualified conversations and observed behavior shows customers bypass ImplicitEx for direct transfer; stop treating it as the engine before any contract change |
| Support fits small-account economics | Standard onboarding and support time consistent with a $9–$49 account | Persistent custom work or negative service margin; simplify, raise price, or narrow |
| Signed-record complexity earns value | Independent verification works and customers care about the evidence | Complexity delays use without improving conversion, retention, risk, or paid value |
| Gas abstraction removes a real blocker | Measurable reduction in gas-related abandonment at sustainable cost | It adds security or subsidy cost without improving completion |
| On-ramp unlocks qualified demand | Existing prospects complete after acquisition was the blocker | KYC/fees cause similar abandonment or ImplicitEx inherits unsupported obligations |
| A second asset/network unlocks revenue | 3 paying or signed-pilot customers are blocked by the same route | Requests are speculative, free-only, or cannot fund route operations |
| Security posture supports release | No unresolved critical/high issue; medium risks have treatment and owners | Any unresolved critical/high issue or repeated evidence-integrity failure blocks release |
| Regulatory boundary remains viable | Counsel supports the actual flow and claims with manageable obligations | Required licensing, capital, staffing, or control exceeds the business; remove the feature |
| $25,000 is sustainable revenue | $2,083+ monthly run rate with retention, diversified customers, and positive direct margin | Revenue depends on one customer, custom work, or loss-making support |

## Master Decision Rule

> Build the smallest complete self-custodial payment workspace that an
> independent operator uses and pays for repeatedly: identity, request,
> matching, exception handling, evidence, search, and export. Preserve
> non-custody and use partners for regulated edges. Price the service received,
> not commodity transfer volume. Expand sideways only when a missing capability
> blocks named paying customers.

## Reference Baseline — Verified 2026-07-30

Regulatory and competitive facts change. Reverify before implementation or
external publication.

### Regulatory primary sources

- [FinCEN 2019 guidance on convertible virtual-currency business models](https://www.fincen.gov/resources/statutes-regulations/guidance/application-fincens-regulations-certain-business-models)
- [GENIUS Act, Public Law 119-27](https://www.congress.gov/bill/119th-congress/senate-bill/1582)
- [Treasury April 2026 proposed GENIUS Act AML and sanctions rule](https://home.treasury.gov/news/press-releases/sb0435)
- [CLARITY Act congressional status](https://www.congress.gov/bill/119th-congress/house-bill/3633/actions)
- [OFAC virtual-currency sanctions guidance](https://ofac.treasury.gov/system/files/126/virtual_currency_guidance_brochure.pdf)
- [Circle USDC terms](https://www.circle.com/legal/usdc-terms)

### Competitive and standards sources

- [ENS resolution documentation](https://docs.ens.domains/learn/resolution/)
- [Request Network glossary and payment-reference model](https://docs.request.network/glossary)
- [Request Finance pricing](https://www.requestfinance.com/pricing)
- [Request Finance freelancer and contractor cost policy](https://help.request.finance/en/articles/10397958-what-does-request-cost)
- [Coinbase Business payment links and invoices](https://help.coinbase.com/en/coinbase/other-topics/business/payment-links-invoices)
- [Coinbase Commerce-to-Business transition and migrating-merchant pricing](https://help.coinbase.com/en/transitioning-from-coinbase-commerce-to-coinbase-business)
- [Coinbase Business APIs and webhooks](https://help.coinbase.com/en/coinbase/other-topics/business/apis-and-developer-tools)
- [BitPay merchant processing fees](https://support.bitpay.com/hc/en-us/articles/203324073-What-fees-will-I-pay-to-use-BitPay-for-payment-processing)
- [ERC-681 transaction-request URL standard](https://eips.ethereum.org/EIPS/eip-681)
- [Safe smart-account module documentation](https://docs.safe.global/advanced/smart-account-modules)
- [Safe spending limits](https://help.safe.global/articles/3961440620-set-up-and-use-spending-limits)
- [Safe proposer role](https://help.safe.global/articles/1671337645-proposers)
- [Safe transaction batching](https://help.safe.global/articles/4180673514-transaction-builder)
- [Worldpay reporting and reconciliation](https://worldpay.com/en/products/reporting-and-insights)

### Canonical internal trust contracts

- `docs/product/coin-card/COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md`
- `docs/product/coin-card/COIN_CARD_LIFECYCLE_REGISTRY_CONTRACT_V1.md`
- `docs/product/coin-card/COIN_CARD_LIFECYCLE_RECORD_AUTHENTICATION_AND_CANONICALIZATION_CONTRACT_V1.md`
- `docs/product/coin-card/COIN_CARD_EXECUTION_AUTHORIZATION_CONTRACT_V1.md`
- `docs/product/coin-card/COIN_CARD_TRANSACTION_EVIDENCE_CONTRACT_V2.md`
