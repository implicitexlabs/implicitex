# ImplicitEx Product Capability Decision Register

Date: 2026-07-30
Revision: 1 — extracted during the Revision 6 editorial audit
Status: Subordinate decision register; not legal advice

This register preserves detailed capability decisions without crowding the
master roadmap. It does not authorize work or change release order.
`docs/product/product-commercial-roadmap-2026-07-30.md` governs phase, gates,
commercial scope, exclusions, and horizontal expansion.

Each record states:

1. the customer problem and proposed capability;
2. whether the capability complements, replaces, or is excluded from the
   current product;
3. its security, legal, data, or authority dependencies; and
4. its revenue hypothesis, validation evidence, and completion condition.

A change that affects release scope, custody, pricing bands, binding gates, or
the one-year sequence requires a corresponding master-roadmap revision.

## V1 — Active Pilot Capabilities

### Modular portal and shared product objects

- **Problem → feature:** A growing toolbox can become crowded and internally
  inconsistent; use progressive disclosure over shared profile, contact, Coin
  Card, request, transfer, evidence, template, and exception objects.
- **Complement / decision / scope:** Complements the existing portal and Coin
  Card surfaces; define IDs, relationships, and states now, then add detail
  workspaces only with V2/V3 customer tasks.
- **Security dependency:** Tenant isolation, object-level authorization,
  authoritative state source, safe deep links, no hidden execution facts, and
  no arbitrary presentation code.
- **Revenue / validation / completion:** Enables the suite without selling
  complexity; validate lower task time and fewer navigation errors; complete
  when summary, detail, action, and evidence views agree and advanced views do
  not burden the default workflow.

### Controlled Coin Card issuance

- **Problem → feature:** Raw addresses provide no managed lifecycle; issue
  manual, expiring pilot credentials.
- **Complement / decision / scope:** Complements the existing Coin Card and
  registry stack; build now for Polygon USDC only.
- **Security dependency:** Production wallet challenge, entitlement authority,
  namespace review, revocation, audit trail, and closed Gate 1A exception.
- **Revenue / validation / completion:** Pilot is a priced-offer test even when
  fees are waived; validate 10 placements and 3 real payments; complete when
  issuance, expiry, suspension, revocation, and recovery work without founder
  improvisation.

### Route lineage and independent verification

- **Problem → feature:** Current resolution cannot prove what route governed a
  prior payment; preserve signed revisions and lifecycle history.
- **Complement / decision / scope:** Complements existing manifest, lifecycle,
  and transaction-evidence contracts; build now by closing gaps, not inventing
  a second trust system.
- **Security dependency:** Canonical bytes, domain separation, authorized keys,
  rotation, freshness, rollback protection, immutable prior records, and
  fail-closed status.
- **Revenue / validation / completion:** Supports paid maintenance and proof;
  validate in a route-change or dispute scenario; complete when a third party
  can verify the governing version and settlement without trusting mutable UI.

### Proof packets, activity, and export

- **Problem → feature:** Chats, screenshots, and explorer links are fragmented;
  create a portable request-to-settlement artifact plus searchable export.
- **Complement / decision / scope:** Complements receipts and Transaction
  Evidence; build now for proof hardening and in V2 for search/CSV.
- **Security dependency:** Chain truth precedence, tamper evidence, formula-safe
  CSV, authorization, retention, and explicit fact-versus-inference labels.
- **Revenue / validation / completion:** Supports paid operations; validate in
  client, bookkeeper, reconciliation, or dispute use; complete when every export
  row traces to evidence and survives refresh or provider failure.

## V2 Gate 0 and Core

### Account and tenant foundation

- **Problem → feature:** V2 introduces private customer, billing, request, and
  operational records; establish authenticated accounts and isolated tenants
  before storing them.
- **Complement / decision / scope:** Complements the portal object model and
  billing; binding V2 Gate 0 work, limited to the account and data capabilities
  required by V2 Core.
- **Security dependency:** Recovery, deletion, object authorization, tenant
  isolation, administrative access, audit logs, retention, backups, privacy,
  PII minimization, and incident response.
- **Revenue / validation / completion:** Enables a supportable paid workspace;
  complete only when isolation and recovery tests pass, administrative actions
  are auditable, and a customer can export and delete eligible account data.

### Structured signed payment requests

- **Problem → feature:** Amount, purpose, destination, and deadline are split
  across messages; create a signed request that freezes those facts.
- **Complement / decision / scope:** Complements Coin Card and proof packets;
  build in V2 after V1 signed-record ratification; use ERC-681 for wallet handoff
  rather than redefining it. Start with fixed-amount, expiring requests;
  open-amount or reusable requests require a separate matching and abuse rule.
- **Security dependency:** Request family, canonical atomic amounts, expiration,
  nonce or request ID, replay rules, mutation invalidation, safe URL handling,
  and transaction-time snapshot.
- **Revenue / validation / completion:** Candidate anchor for the small-operator
  plan; validate on five real requests; complete when the request shown,
  authorized, and preserved is byte-consistent with the evidence packet.

### Matching, reconciliation, and exception handling

- **Problem → feature:** Raw wallet history does not say which obligation was
  satisfied; bind known ImplicitEx submissions to requests and distinguish them
  from suggested external matches.
- **Complement / decision / scope:** Complements signed requests and proof
  packets; V2 Core uses a request ID frozen into execution intent, a captured
  transaction hash, and a minimal watcher for known submissions. Partial,
  overpayment, duplicate, and advanced exception logic belongs to V2 Expansion.
- **Security dependency:** Verified sender, recipient, token, chain, amount,
  fee, executor, event, idempotency, reorganization handling, uncertain-handoff
  recovery, correction history, and tenant authorization.
- **Revenue / validation / completion:** Core small-operator value; validate on
  five real payment cycles; complete when authoritative, suggested, and
  uncertain labels are evidence-derived and never inferred from amount plus
  address alone.

### Paid entitlement and assisted setup

- **Problem → feature:** Customers need predictable maintained service and may
  need initial setup help; add simple billing and fixed-scope onboarding.
- **Complement / decision / scope:** Complements V1 evidence; build in V2;
  reject recurring custom development.
- **Security dependency:** Signed billing webhooks, idempotency, least privilege,
  cancellation, grace period, data export, no handling of customer keys, and
  accurate written product disclosure to the billing provider before launch.
- **Revenue / validation / completion:** Test $9–$19 identity/records,
  $25–$49 operator, fixed managed-request, and $299–$750 setup offers;
  completion requires paid conversion, independent post-setup use, and known
  delivery margin.

## V2 Expansion Pool

### Templates, reminders, and scheduled final approval

- **Problem → feature:** Repeat obligations are reconstructed from memory and
  messages; save an instruction, present it at the right time, and require a
  fresh wallet approval to execute.
- **Complement / decision / scope:** Templates and request reminders follow the
  V2 Core as one-at-a-time V2 Expansion candidates; scheduled outbound
  preparation remains in the V3 workflow pool. None is an automatic or
  preauthorized pull.
- **Security dependency:** Signed instruction version, authenticated scheduler,
  stale-route revalidation, time-zone handling, cancellation, duplicate
  prevention, fresh balance/network review, and explicit non-execution states.
- **Revenue / validation / completion:** Candidate retention value for the
  operator plan; validate three genuine repeat obligations; complete when the
  system can remember and prepare but cannot transfer without current user
  authorization.

### Bounded analytics and verification claims

- **Problem → feature:** Card holders need evidence of use and payers need
  bounded confidence; provide payment counts/volume and narrow social or domain
  control claims.
- **Complement / decision / scope:** Complements registry and receipts; build
  only as a one-at-a-time V2 Expansion capability after demand; no “identity
  verified.”
- **Security dependency:** PII policy, minimal edge logging, claim provenance,
  expiration, revocation, disputes, and public definition of every badge.
- **Revenue / validation / completion:** Candidate paid-tier value; validate
  willingness to pay from at least three customers; complete when every metric
  and claim has a source, retention rule, and correction path.

## V3 Experiment Pool

### Bounded operational intelligence

- **Problem → feature:** Operators must translate transaction records into
  actions; provide factual search, evidence-linked summaries, exception
  explanations, and draft action preparation.
- **Complement / decision / scope:** Complements structured requests,
  reconciliation, and evidence; selectable from the V3 workflow pool only after
  reliable V2 records exist. No autonomous transfers, tax conclusions, legal
  advice, or unsupported fraud verdicts.
- **Security dependency:** Tenant isolation, prompt/data minimization,
  provenance links, fact-versus-inference labels, deterministic approval
  gates, output logging, and protection against prompt-driven execution.
- **Revenue / validation / completion:** Premium workflow hypothesis, not an
  “AI” surcharge; validate saved administrative time and accepted drafts;
  complete when every material answer links to source records and no generated
  output can move funds.

### Recent recipients and name resolution

- **Problem → feature:** Repeated payers search old messages and re-copy
  addresses; show recent ImplicitEx recipients, optional local labels, and
  correctly resolved ENS names.
- **Complement / decision / scope:** Complements recipient context; build later
  only if selected from the V3 access pool, using ImplicitEx contract events
  first, not every wallet interaction. Chain reads consume RPC or indexing
  capacity, not user gas; local labels are deliberately device-bound at first.
  ENS supplies portable naming; Coin Card supplies payment context, route
  status, lineage, and evidence. Integrate rather than imitate ENS.
- **Security dependency:** Deduplication, spam exclusion, complete-address
  confirmation, address-change warning, and verified ENS forward resolution.
- **Revenue / validation / completion:** Retention feature, not a standalone
  product; validate repeat-recipient use; complete when suggestions never imply
  identity and every selection reaches the full review screen.

### QR and POS presentation

- **Problem → feature:** In-person and mobile coordination is awkward; encode a
  signed request or standards-compatible handoff in a QR.
- **Complement / decision / scope:** Complements V2 request links; build later
  only if selected from the V3 access pool after link integrity is proven.
- **Security dependency:** QR-substitution resistance, visible recipient and
  full-address access, expiration, and unambiguous settled state.
- **Revenue / validation / completion:** May unlock local sellers; validate
  three genuine in-person payments; complete when the displayed request and
  payer-reviewed instruction match.

### Gas abstraction

- **Problem → feature:** Requiring POL merely to move USDC blocks non-expert
  users; test sponsored gas or USDC-denominated gas experience.
- **Complement / decision / scope:** Complements wallet execution; feasibility
  only if selected from the V3 access pool after paid workflow evidence.
- **Security dependency:** Current wallet capability review, smart-account and
  paymaster threat model, spending limits, abuse controls, audit, and monitored
  subsidy budget.
- **Revenue / validation / completion:** Access and conversion feature, not a
  thesis by itself; validate measured reduction in gas-related abandonment;
  complete only with sustainable cost per successful payment.

### Third-party on-ramp

- **Problem → feature:** Some qualified senders have USD but need USDC; embed or
  link to a licensed partner that delivers to the user-controlled wallet.
- **Complement / decision / scope:** Complements V3 access; selectable from the
  V3 access pool, never first-party conversion.
- **Security dependency:** Counsel review, partner licensing and coverage,
  KYC/fraud ownership, fee disclosure, redirect integrity, privacy, outage, and
  support boundaries.
- **Revenue / validation / completion:** Adoption feature; validate with users
  demonstrably blocked by acquisition; complete when total cost and responsible
  party are explicit and ImplicitEx never receives fiat or stablecoins.

## Conditional Release Control

### Address risk and sanctions screening

- **Problem → feature:** A prohibited or high-risk destination can create legal,
  fraud, and trust exposure; evaluate proportionate pre-send screening.
- **Complement / decision / scope:** Complements verification and preflight;
  counsel decides whether it is a binding release control. If not required, it
  remains a later risk feature, never an unsupported “safe address” badge.
- **Security dependency:** Counsel-defined obligations, source freshness,
  false-positive appeal, provider outage, logging limits, and blocked-state
  behavior.
- **Revenue / validation / completion:** Risk-control and possible premium
  evidence feature; validate support burden and detection value; complete when
  results are accurately framed, auditable, and never represented as a
  guarantee.

## Longer-Horizon Door Register

These doors are not active capabilities. The master roadmap may open one only
after its stated evidence gate passes.

| Door | Opens only when |
|---|---|
| Preauthorized or automatic scheduled payments | Scheduled-with-final-approval is used; gas abstraction is proven; counsel approves the authority model; the module is separately audited |
| API, SDK, webhooks, and chain indexer | Stable manual model plus 3 inbound integrations with named owners and budgets |
| Notifications | Indexer exists and PII/retention policy is approved |
| Small-team access | 3 paying customers demonstrate owner/viewer or preparer/reviewer use; tenant and session security are funded |
| Safe preparation/approval integration | 3 payer-side customers need separation of preparation and approval; integrate Safe authority instead of building a treasury wallet |
| Batch payouts | Incoming-payment workspace retains customers; contractor/vendor demand exists; screening and a separate contract audit pass; never market as payroll |
| Split payments | Named demand and a separate contract, governance, and security gate |
| Accounting integration | CSV export is used and 3 paying customers request the same integration |
| Freelancer invoicing suite | Narrow requests and exports retain users; do not compete broadly with mature invoicing products |
| Business verification / KYB | Customers name the required claim and its verification/dispute labor supports the price |
| Bounded Transfer Analysis | Sufficient history exists for deterministic route, recipient, amount, and evidence rules; facts and inference remain separate |
| ENS or portable subnames | Namespace policy is proven and customers value portability enough to fund gas and governance |
| CMS plugins | Embed adoption proves value and maintenance cost is funded |
| Opt-in directory | Card density justifies discovery and moderation capacity exists |
| Goals, presets, supporter counts | Creator use is real; public data remains opt-in |
| Third-party off-ramp | Named corridor demand and licensed partner coverage |
| White-label portal | Two or three fixed-scope, profitable hand-held deals prove repeatability |
| Activity-linked fee discounts | Unit economics and simple fee messaging survive testing |
| Native mobile app | PWA/mobile web are proven and a platform limitation blocks retained paid usage |
| x402 or agent access | Registry density and real machine customers justify a programmatic product |
| Remittance corridor partnership | Volume proves a corridor and a licensed local partner passes diligence |
| Partner debit card | Volume supports program-manager discussion and customer KYC is strategically acceptable |
