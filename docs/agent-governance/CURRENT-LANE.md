lane_id: m3-payment-route-contract
status: ACTIVE

# CURRENT-LANE.md — M3 Payment Route Management: Contract Authoring
# ==================================================================
# Documentation-only lane. Author the authoritative M3 contract for
# associating a payment route with an IX ID. No implementation.
# No production changes. No deployment.
#
# Human authorization: 2026-08-24. Explicit instruction:
# "Proceed with M3 Payment Route Management contract authoring next.
#  Do NOT open Slice I yet. Do NOT combine Slice I and M3 in one lane.
#  Do NOT modify production infrastructure. Do NOT deploy anything.
#  Goal: Author the authoritative M3 contract for associating a payment
#  route with an IX Id so later implementation can bind a wallet/USDC
#  destination and ultimately support the ImplicitEx payment flow."
#
# CURRENT-LANE.md is fail-closed (I-1). If this file is missing, malformed,
# internally contradictory, or does not authorize the requested work,
# scope-sentinel must return BLOCKED. No best-effort interpretation permitted.

objective: >
  Author docs/architecture/ixid-payment-route-v0.1.md — the authoritative
  M3 contract for Payment Route Management. This contract defines the data
  model, lifecycle, API surface, persistence invariants, security requirements,
  and dependency chain required for a future M3 implementation to associate
  a Polygon/USDC payment route with an IX ID. No implementation occurs in
  this lane. The contract is the deliverable.

authoritative_baseline_commit: 47e946e0f5d4d075e463c4bc2d2805bfd6f0442a

# ─────────────────────────────────────────────────────────────────────────
# PRIOR LANE RECORDS
# ─────────────────────────────────────────────────────────────────────────
prior_lane_records:
  - lane_id: m2-slice-h-wallet-connection
    status: COMPLETE
    commit: 47e946e0f5d4d075e463c4bc2d2805bfd6f0442a
    evidence:
      - wallet-connector.js: EIP-1193 provider detection, address/chain validation
      - onboarding-core.js: WALLET_PENDING + WALLET_CONNECTED states
      - register.js: wallet panel wired
      - index.html: wallet section added
      - wallet-connector.test.js: 22/22 PASS
      - frontend-contract.test.js: 20/20 PASS (unchanged)
      - action-adapter.test.js: 12/12 PASS (unchanged)
      - config.js enabled: false confirmed
      - Zero production deployment
      - POST-WORK sentinel GO
      - Explicit human commit approval 2026-08-24

  - lane_id: m2-activation-phases-2-5
    phase_2: COMPLETE
    phases_3_5: PARKED — external blockers
    external_blockers:
      - Cloud Armor: SECURITY_POLICIES quota = 0 globally, GCP support case open (Slice D)
      - Firebase custom action URL: parked pending Google Support response
    resumption: >
      Phases 3–5 resume when Google resolves quota/support. Opening M3 contract
      authoring does not abandon that work; it will be re-authorized in a dedicated
      activation-continuation lane once external dependencies clear.

# ─────────────────────────────────────────────────────────────────────────
# SCOPE
# ─────────────────────────────────────────────────────────────────────────
scope: >
  Author exactly one architecture document:
    docs/architecture/ixid-payment-route-v0.1.md
  The document must define the authoritative M3 contract covering all twelve
  sections declared in the human authorization instruction. It must be
  internally consistent, compatible with frozen M1 and M2 contracts, and
  sufficient for a future implementation team to build M3 without further
  contract negotiation.

# ─────────────────────────────────────────────────────────────────────────
# WRITABLE PATHS
# ─────────────────────────────────────────────────────────────────────────
allowed_write_paths:
  - docs/architecture/ixid-payment-route-v0.1.md   # new contract document

# ─────────────────────────────────────────────────────────────────────────
# READ-ONLY PATHS (authoritative sources — must not be modified)
# ─────────────────────────────────────────────────────────────────────────
read_only_paths:
  - docs/architecture/ixid-holder-authority-v0.1.md
  - docs/architecture/ixid-onboarding-v0.1.md
  - docs/architecture/ixid-firestore-schema-v0.1.md
  - docs/architecture/ixid-identity-trust-architecture-v0.1.md
  - docs/architecture/ixid-production-authority-and-gating-precedent-v0.1.md
  - services/ixid_holder_authority_handler.py
  - services/ixid_holder_authority_service.py

# ─────────────────────────────────────────────────────────────────────────
# CONSTRAINTS
# ─────────────────────────────────────────────────────────────────────────
constraints:
  documentation_only:
    - This lane produces exactly one new architecture document
    - No implementation code may be written
    - No service files may be modified
    - No production infrastructure changes
    - No deployment of any kind
  contract_requirements:
    - Must be internally consistent with frozen M1 (ixid-holder-authority-v0.1.md)
    - Must be internally consistent with frozen M2 (ixid-onboarding-v0.1.md)
    - Must be consistent with ixid-firestore-schema-v0.1.md wallet_binding_events schema
    - Polygon mainnet + native USDC only for v0.1 network/asset invariant
    - M4 (wallet ownership proof / SIWE) must be explicitly deferred — not designed here
    - No custody, no private keys, no fiat/card rail
    - Must include testable acceptance criteria for future M3 implementation
  scope_boundary:
    - Slice I (WalletConnect SDK) is explicitly NOT in this lane
    - M3 implementation is explicitly NOT in this lane
    - M4 design is explicitly NOT in this lane (deferred)

# ─────────────────────────────────────────────────────────────────────────
# EXPLICITLY NOT AUTHORIZED
# ─────────────────────────────────────────────────────────────────────────
not_authorized:
  - Any implementation code (Python, JavaScript, or otherwise)
  - Any service file modification
  - Any Firestore rule change
  - Any production deployment or GCP mutation
  - Slice I (WalletConnect SDK integration)
  - M4 wallet ownership proof design or implementation
  - M3 implementation (that is a future lane)
  - SIWE implementation
  - Fee execution design (deferred to M6+)
  - Firebase/Cloud Armor activation path changes
  - Any Coin Card / app-web changes

# ─────────────────────────────────────────────────────────────────────────
# REQUIRED CONTRACT SECTIONS
# ─────────────────────────────────────────────────────────────────────────
required_sections:
  1: PAYMENT_ROUTE data model (route_id, ix_id, chain, asset, destination, status, timestamps, versioning)
  2: v0.1 network/asset invariant (Polygon mainnet, native USDC only, no custody)
  3: Route lifecycle (create, read, replace/update, disable/revoke; deletion policy; no-active-route behavior)
  4: Ownership and authority boundary (holder manages own route; M4 ownership proof deferred; fail-closed without M4)
  5: API contract (endpoints, methods, schemas, auth, idempotency, status/error codes)
  6: Persistence invariants (Firestore model, atomicity, concurrency/version conflicts, audit events)
  7: Payment-read surface (minimal data for sender/payment flow; no payment execution in M3; no fee collection in M3)
  8: Security requirements (address validation, chain/asset validation, authorization, rate-limit, no secret material, logging/redaction)
  9: Explicit non-goals (SIWE → M4; WalletConnect → Slice I; USDC transfer → later; 1% fee → later; merchant checkout → later)
  10: Testable acceptance criteria for future M3 implementation
  11: Migration/compatibility with existing IX Id holder/account model
  12: Dependency chain (M3 route mgmt → M4 wallet proof → payment execution / 1% fee)

# ─────────────────────────────────────────────────────────────────────────
# ACCEPTANCE GATES
# ─────────────────────────────────────────────────────────────────────────
acceptance_gates:
  - PRE-WORK scope-sentinel returns GO before authoring
  - docs/architecture/ixid-payment-route-v0.1.md authored with all 12 required sections
  - Independent contract review agent run; contradictions resolved
  - Internal consistency with frozen M1/M2 contracts confirmed
  - POST-WORK scope-sentinel returns GO
  - Exact document diff presented to human
  - Explicit human commit approval

doctrine_freshness:
  reference_commit: 162eeb0a5ae4efeed0e208593321bad41dd259fe
  paths:
    - AGENTS.md
    - CLAUDE.md
    - .claude/agents/scope-sentinel.md
    - docs/agent-governance/CHARTER.md
    - docs/agent-governance/FROZEN-INVARIANTS.md

last_human_review: "2026-08-24"
  # Metadata only. Not freshness proof or authorization.
