lane_id: m2-slice-h-wallet-connection
status: ACTIVE

# CURRENT-LANE.md — M2 Slice H: Wallet Connection (Dark)
# =========================================================
# Client-side wallet connection UI. Dark build only — no production
# deployment of wallet code. app.ixid.me continues to serve the M2
# onboarding frontend with onboarding disabled (enabled: false).
#
# Human authorization: 2026-08-24. Explicit instruction:
# "pivot back to Slice H — wallet connection, but keep it dark/non-production
# and make absolutely no changes to the blocked Firebase/Cloud Armor
# activation path."
#
# CURRENT-LANE.md is fail-closed (I-1). If this file is missing, malformed,
# internally contradictory, or does not authorize the requested work,
# scope-sentinel must return BLOCKED. No best-effort interpretation permitted.

objective: >
  Implement client-side wallet connection so a user at ACTIVE workspace
  (after claiming an IX ID handle) can connect a Polygon-compatible wallet
  and see their address displayed. Zero authority mutations. Zero production
  deployment of wallet code. Stays entirely in the local/test layer.

authoritative_baseline_commit: bca3251ab51c3acc8eb8fb0b0e488cb570bbdfd3

# ─────────────────────────────────────────────────────────────────────────
# PRIOR LANE — PARTIAL COMPLETION RECORD
# ─────────────────────────────────────────────────────────────────────────
prior_lane_record:
  lane_id: m2-activation-phases-2-5
  phase_2: COMPLETE
  phase_2_evidence:
    - ixid-onboarding-web-00002-6fs serving 100% traffic
    - app.ixid.me no longer serves Slice A placeholder
    - /auth/action returns 200
    - /config.js returns 200, enabled: false confirmed
    - app.ixid.me confirmed as Firebase authorized domain
  phases_3_5: PARKED — external blockers
  external_blockers:
    - Cloud Armor: SECURITY_POLICIES quota = 0 globally, GCP support case open (Slice D)
    - Firebase custom action URL: parked pending Google Support response
  resumption: >
    Phases 3–5 resume when Google resolves quota/support. Opening Slice H
    does not abandon that work; it will be re-authorized in a dedicated
    activation-continuation lane once external dependencies clear.

# ─────────────────────────────────────────────────────────────────────────
# SCOPE
# ─────────────────────────────────────────────────────────────────────────
scope: >
  Extend the onboarding flow from ACTIVE state to WALLET_CONNECTED state.
  A user who has completed onboarding (email verified, account ACTIVE,
  IX ID ACTIVE) can connect a Polygon wallet and see their address on the
  workspace. Zero Firebase mutations. Zero Holder Authority API calls.
  Zero production deployment of wallet code in this slice.

# ─────────────────────────────────────────────────────────────────────────
# WRITABLE PATHS
# ─────────────────────────────────────────────────────────────────────────
allowed_write_paths:
  - ixid-onboarding-web/public/wallet-connector.js   # new module
  - ixid-onboarding-web/public/onboarding-core.js    # add WALLET_PENDING/WALLET_CONNECTED states
  - ixid-onboarding-web/public/register.js           # wire wallet state transitions
  - ixid-onboarding-web/public/index.html            # add wallet panel section
  - ixid-onboarding-web/tests/wallet-connector.test.js  # new test suite

# ─────────────────────────────────────────────────────────────────────────
# READ-ONLY PATHS
# ─────────────────────────────────────────────────────────────────────────
read_only_paths:
  - ixid-onboarding-web/public/config.js
  - ixid-onboarding-web/public/action.js
  - ixid-onboarding-web/public/action.html
  - ixid-onboarding-web/public/action-adapter.js
  - ixid-onboarding-web/public/firebase-auth-adapter.js
  - ixid-onboarding-web/public/holder-api-client.js
  - ixid-onboarding-web/package.json
  - ixid-onboarding-web/tests/onboarding-core.test.js
  - ixid-onboarding-web/tests/frontend-contract.test.js
  - ixid-onboarding-web/tests/action-adapter.test.js
  - docs/architecture/ixid-onboarding-v0.1.md

# ─────────────────────────────────────────────────────────────────────────
# IMPLEMENTATION CONSTRAINTS
# ─────────────────────────────────────────────────────────────────────────
constraints:
  wallet_connection:
    - Detect injected EIP-1193 provider (window.ethereum) only
    - No WalletConnect SDK in this slice — that is Slice I or later
    - Request eth_requestAccounts via the injected provider
    - Validate chain ID against Polygon mainnet (137) or configured testnet
    - Display checksummed or lowercase EVM address on workspace
    - No transaction execution — connection only
  state_machine:
    - New states: WALLET_PENDING (connecting) and WALLET_CONNECTED (address known)
    - Transitions: ACTIVE → WALLET_PENDING → WALLET_CONNECTED (or ACTIVE on rejection)
    - Wallet address stored in client snapshot only — zero Holder Authority calls
    - Wallet state is not persisted across page reloads in this slice
  no_production_changes:
    - config.js enabled flag must NOT be changed
    - No Docker build or Cloud Run deployment of wallet code
    - No GCP or Firebase mutations of any kind
    - The live production service (00002-6fs) must remain unchanged
  regression:
    - All existing tests must continue to pass:
        20/20 frontend-contract.test.js
        12/12 action-adapter.test.js
    - New wallet-connector.test.js must cover provider detection,
      address validation, chain ID validation, connection rejection,
      and reconnection

# ─────────────────────────────────────────────────────────────────────────
# EXPLICITLY NOT AUTHORIZED
# ─────────────────────────────────────────────────────────────────────────
not_authorized:
  - Any change to Firebase/Cloud Armor activation path
  - config.js enabled flag change
  - Production deployment of wallet code
  - WalletConnect / Reown SDK integration (Slice I+)
  - Holder Authority wallet-binding route (M3)
  - Slice F forensic record
  - Any Coin Card / app-web changes

# ─────────────────────────────────────────────────────────────────────────
# ACCEPTANCE GATES
# ─────────────────────────────────────────────────────────────────────────
acceptance_gates:
  - PRE-WORK scope-sentinel returns GO before implementation
  - wallet-connector.js: provider detection, address/chain validation, connection/rejection
  - onboarding-core.js: WALLET_PENDING and WALLET_CONNECTED states in snapshot
  - register.js: wallet panel wired to controller
  - New wallet-connector.test.js passes (minimum: provider detection, address valid,
    chain valid, rejection → ACTIVE, reconnection offered)
  - 20/20 frontend-contract.test.js unchanged
  - 12/12 action-adapter.test.js unchanged
  - config.js enabled flag remains false in committed code
  - POST-WORK scope-sentinel returns GO
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
