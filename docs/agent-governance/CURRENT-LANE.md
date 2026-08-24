lane_id: m2-activation-smoke-runbook-authoring
status: ACTIVE
amendment: 0

# CURRENT-LANE.md — Authoritative execution boundary
# =====================================================
# Authorizes authoring of the M2 production activation and smoke runbook
# as a single static documentation artifact only. No execution of any
# activation step, smoke probe, or Firebase/GCP mutation is authorized.
#
# CURRENT-LANE.md is fail-closed (I-1). If this file is missing, malformed,
# internally contradictory, or does not authorize the requested work,
# scope-sentinel must return BLOCKED. No best-effort interpretation is permitted.

# KNOWN PRE-LANE GOVERNANCE EVENT — READ-ONLY SCOPE EXCURSION
# ─────────────────────────────────────────────────────────────
# The following eight tracked files were read during source-set discovery
# while CURRENT-LANE.md had status: CLOSED (commit 1a1e33c). No repository
# or external-state mutation occurred.
#
#   infra/ixid-onboarding-web/deploy-slice-a.sh
#   infra/ixid-public-ingress/verify-v0.1.sh
#   infra/ixid-public-ingress/production-state-v0.1.md
#   infra/ixid-holder-authority/ixid-url-map-holder-amendment.yaml
#   docs/operations/evidence/ixid-holder-authority-m1-production-state-2026-08-20.md
#   docs/operations/testnet-deploy-runbook-2026-04-30.md
#   ixid-onboarding-web/public/holder-api-client.js
#   ixid-onboarding-web/package.json
#
# These reads are recorded as provenance only. They occurred outside an
# ACTIVE lane and grant zero authority. They may not be used as authoritative
# runbook evidence. After this lane is properly opened and PRE-WORK returns
# GO, every file used to derive runbook content must be freshly re-read
# under the authorized read_only_paths below. The runbook may cite only
# evidence obtained from those post-GO authorized reads.
#
# PRE-WORK should verify this event is accurately recorded and that no
# mutation occurred. PRE-WORK does not determine retroactively whether those
# reads were valid in-lane work — they were not. They are a recorded
# governance event, not authorized discovery.

authoritative_baseline_commit: 1a1e33c

# ── OBJECTIVE ────────────────────────────────────────────────────────────────

objective: >
  Create docs/operations/ixid-m2-activation-smoke-runbook.md — a single
  static documentation artifact containing the complete M2 production
  activation and smoke procedure. This file is the sole writable product
  of this lane.

  DOCUMENTATION ONLY. The runbook's existence confers zero execution
  authority. Each step is instructional only. Production execution of any
  step requires a subsequent human-authorized execution lane whose
  CURRENT-LANE.md names this runbook and each specific authorized step.

  CONTRACT_GAP RULE: If the governing contract describes what state must
  be reached but does not provide (and no authorized read_only_path
  demonstrates) the exact command or procedure to reach or verify that
  state, label that item CONTRACT_GAP in the runbook. Do not present a
  constructed or inferred command as authoritative. Candidate syntax may
  be labeled "unverified candidate — requires CONTRACT_GAP resolution
  before execution" and must not be formatted as executable instruction.

  The runbook must contain the following sections in order:

  SECTION A — Prerequisite / stop-condition matrix
    One page. All items must be satisfied (GO) before any activation step.
    Execution is STOP unless every row is GO. Include at minimum:
      □ Cloud Armor security policy attached to ixid-holder-backend and
        verified active on /api/holder/* paths (§8.2) — currently BLOCKED
        (Slice D quota)
      □ ixid-onboarding-web deployed to Cloud Run and action page reachable
        at https://app.ixid.me/auth/action
      □ Firebase authorized-domain confirmed: app.ixid.me present in
        Authentication → Authorized domains
      □ Firebase custom action URL confirmed: https://app.ixid.me/auth/action
      □ continueUrl proven: a real generated Firebase action link has been
        inspected and contains continueUrl=https://app.ixid.me/register
      □ Production Web API key confirmed present in config.js as
        IXID_ONBOARDING_CONFIG.firebase.options.apiKey at app.ixid.me
      □ Full regression gate satisfied (§1.8 step 6) — see Section B
      □ Smoke mailbox confirmed: m2-smoke@ixid.me is a controlled, deliverable
        address capable of receiving from noreply@ixid-prod.firebaseapp.com
      □ Firebase email/password provider confirmed DISABLED at runbook open
      □ Explicit human execution authorization for this specific run

  SECTION B — Regression gate (§1.8 step 6)
    Classify each test command as one of:
      LOCAL/STATIC: runs against emulator or mocks, no production state
      PRODUCTION-READ-ONLY: reads production state, no mutation
      PRODUCTION-MUTATING: creates, modifies, or deletes production state
    The contract §1.8 step 6 wording is exact: "The M2 gate tests pass (§13)."
    Do not paraphrase. Derive the full gate from Part 13 of ixid-onboarding-v0.1.md
    and the test files. Note: npm test in ixid-onboarding-web/ (derived from
    package.json) does NOT include action-adapter.test.js; that test is
    invoked separately as: node tests/action-adapter.test.js
    If a production invocation is required by the contract but no authorized
    read_only_path establishes the exact command, label it CONTRACT_GAP.

  SECTION C — Firebase step-4 verification
    Structure: precondition → exact procedure → expected result →
               evidence to retain → failure/stop condition → next authorized step.
    Derive from ixid-onboarding-v0.1.md §1.8 step 4. The contract specifies
    what configuration must exist; if no authorized tracked file demonstrates
    a verification command, label the verification method CONTRACT_GAP.

  SECTION D — Provider enablement (§1.8 step 7)
    Firebase email/password — the final activation switch.
    Structure: precondition → exact procedure → expected result →
               evidence to retain → failure/stop condition → next authorized step.
    Include the fail-closed rule: if any S2 probe fails at step 8, immediately
    disable email/password again (§1.8 fail-closed rule, verbatim).

  SECTION E — S2 smoke probes (§12.1.2)
    S2-1 through S2-4 in exact contract order. For each:
      Precondition → exact procedure (request command) → expected result
      (HTTP status, headers, body) → evidence to retain →
      failure/stop condition → next authorized step.
    Derive request structure from: ixid-onboarding-v0.1.md Part 2 API routes
    + ixid-onboarding-v0.1.md §12.1.2 probe descriptions +
    holder-api-client.js request shape (auth header: Authorization: Bearer <token>;
    Content-Type: application/json for POST; operation_id and handle in body).
    Use exact contract vocabulary for expected results (401, 409, 201, 200, etc.)
    and cache-control requirements.
    Cite the source path inline for each derived value.
    Note the 409 probe ordering constraint verbatim from §12.1.2.

  SECTION F — Post-smoke neutralization (§12.1.3)
    Derived strictly from §12.1.3 and §12.1.1. Document exactly:
      1. Disable Firebase user m2-smoke@ixid.me (disabled: true)
      2. Set validSince to the current Unix timestamp (revokes refresh tokens)
      3. Confirm both via re-query
      4. Record smoke evidence following M1 evidence document format
         (source: docs/operations/evidence/ixid-holder-authority-m1-production-state-2026-08-20.md)
    State explicitly: Firestore authority records for the smoke identity and
    handle are preserved permanently. The handle m2-smoke is never recycled,
    released, reassigned, or deleted (§12.1.1).
    CONTRACT_GAP rule applies: the exact Firebase Admin command for steps 1-2
    and the re-query mechanism for step 3 must be labeled CONTRACT_GAP if no
    authorized tracked file demonstrates them.

  SECTION G — Fail-closed rollback
    If any of S2-1 through S2-4 fails:
    Derive verbatim from §1.8 fail-closed rule. Do not add steps not in the contract.

  TERMINAL SECTION — Execution authority disclaimer (required)
    Must state explicitly: "This runbook authorizes documentation only.
    Its presence confers zero execution authority. Production execution of
    any step in this runbook requires an explicit human-authorized execution
    lane whose CURRENT-LANE.md names this runbook and each specific step
    authorized."

# ── SOURCE BOUNDARIES ────────────────────────────────────────────────────────

allowed_write_paths:
  - docs/operations/ixid-m2-activation-smoke-runbook.md

read_only_paths:
  # Governing contract and operational sources
  - docs/architecture/ixid-onboarding-v0.1.md
  - docs/operations/evidence/ixid-holder-authority-m1-production-state-2026-08-20.md
  - docs/operations/testnet-deploy-runbook-2026-04-30.md
  - infra/ixid-holder-authority/ixid-url-map-holder-amendment.yaml
  - ixid-onboarding-web/public/holder-api-client.js
  - ixid-onboarding-web/public/config.js
  - ixid-onboarding-web/package.json
  # Test files (required by Section B regression-gate derivation)
  - ixid-onboarding-web/tests/onboarding-core.test.js
  - ixid-onboarding-web/tests/adapters.test.js
  - ixid-onboarding-web/tests/frontend-contract.test.js
  - ixid-onboarding-web/tests/action-adapter.test.js
  # Governance definitions (required by independent PRE-WORK/POST-WORK sentinel)
  - AGENTS.md
  - CLAUDE.md
  - .claude/agents/scope-sentinel.md
  - docs/agent-governance/CHARTER.md
  - docs/agent-governance/FROZEN-INVARIANTS.md

# All other paths are neither authorized for reading nor for writing.
# Runbook commands must be derived from read_only_paths above.
# If a required command cannot be derived from an authorized path,
# label it CONTRACT_GAP rather than reading an additional path.

# ── PRE-EXISTING OUTSIDE MANIFEST ────────────────────────────────────────────

pre_existing_outside_manifest:
  classification: PRE-EXISTING / provenance-only
  scope: >
    The following 10 modified tracked files and 55 untracked files predate
    this lane. They were established as PRE-EXISTING under Slice G Amendment 3
    (commit 97bbcba) and remained stable through the Slice G closure (1a1e33c).
    Verified stable at this lane's opening by mechanical comparison with the
    Amendment 3 manifest: sets match item-for-item. Note: Amendment 3 prose
    stated 56 untracked; both the Amendment 3 list and the current observed
    state contain 55 entries. The count is corrected here.
  authority: >
    These paths grant zero read, write, stage, or commit authority inside
    this lane. Their contents must not be opened, referenced, used to derive
    runbook content, or included in the runbook lane commit under any circumstances.
  stability_requirement: >
    POST-WORK review must confirm the outside path/status set exactly matches
    this manifest. If any outside path has appeared, disappeared, changed
    status, or been staged since lane entry, return BLOCKER —
    OUTSIDE MANIFEST UNSTABLE.
  modified_tracked_files:
    - " M app-web/backend/functions/index.js"
    - " M app-web/docs/product/coin-card/COIN_CARD_ARCHITECTURE_INDEX.md"
    - " M app-web/docs/product/coin-card/COIN_CARD_SIGNED_MANIFEST_ENVELOPE_AND_LIFECYCLE_CONTRACT_V1.md"
    - " M app-web/docs/product/coin-card/README.md"
    - " M app-web/package.json"
    - " M coincard/public/claim/index.html"
    - " M docs/product/coin-card/COIN_CARD_INVARIANT_CONTRACT.md"
    - " M docs/product/coin-card/COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md"
    - " M docs/product/coin-card/README.md"
    - " M firebase.json"
  untracked_files:
    - "?? app-web/backend/functions/scripts/deploy-gate1a-staging.js"
    - "?? app-web/backend/functions/src/spikes/SPIKES_ARE_DISPOSABLE.md"
    - "?? app-web/backend/functions/src/spikes/coincard-registry-read-spike.js"
    - "?? app-web/backend/functions/test/staging-deploy-wrapper.test.js"
    - "?? app-web/backend/scripts/spikes/hosting-rewrite/HOSTING_REWRITE_EVIDENCE.md"
    - "?? app-web/backend/scripts/spikes/hosting-rewrite/emulator-firestore.rules"
    - "?? app-web/backend/scripts/spikes/hosting-rewrite/emulator-storage.rules"
    - "?? app-web/backend/scripts/spikes/hosting-rewrite/package-lock.json"
    - "?? app-web/backend/scripts/spikes/hosting-rewrite/package.json"
    - "?? app-web/backend/scripts/spikes/hosting-rewrite/seed-fixtures.js"
    - "?? app-web/backend/scripts/spikes/hosting-rewrite/verify.js"
    - "?? app-web/backend/scripts/spikes/kms-p256-compatibility/KMS_COMPATIBILITY_EVIDENCE.md"
    - "?? app-web/backend/scripts/spikes/kms-p256-compatibility/spike.test.js"
    - "?? app-web/docs/product/coin-card/COIN_CARD_ARTIFACT_V1.md"
    - "?? app-web/docs/product/coin-card/COIN_CARD_BACKEND_ARCHITECTURE_V1.md"
    - "?? app-web/docs/product/coin-card/COIN_CARD_COMMERCIAL_SPEC_V1.md"
    - "?? app-web/docs/product/coin-card/COIN_CARD_ENGINEERING_IMPLEMENTATION_RULES_V1.md"
    - "?? app-web/docs/product/coin-card/COIN_CARD_PURCHASE_PROVISIONING_ARCHITECTURE_V1.md"
    - "?? app-web/docs/product/coin-card/legal/PRIVACY_POLICY_UPDATES.md"
    - "?? app-web/docs/product/coin-card/legal/PURCHASE_TERMS.md"
    - "?? app-web/docs/product/coin-card/legal/REFUND_POLICY.md"
    - "?? app-web/docs/product/coin-card/legal/TERMS_OF_SERVICE_UPDATES.md"
    - "?? app-web/tests/frontend/coin-card-artifact-builder.test.js"
    - "?? app-web/tests/frontend/coin-card-artifact-publication.test.js"
    - "?? app-web/tests/frontend/coin-card-artifact-validation.test.js"
    - "?? app-web/tests/frontend/coin-card-production-identity-migration.test.js"
    - "?? docs/blockaid-review-packet/ImplicitEx_Architecture_and_Security_Overview_v0.1.md"
    - "?? docs/operations/evidence/coin-card-antoine-migration-transport-preflight-2026-08-09.json"
    - "?? docs/operations/evidence/coin-card-antoine-production-identity-allocation-2026-08-09.json"
    - "?? docs/operations/evidence/coin-card-iron-fiat-routing/README.md"
    - "?? docs/operations/evidence/coin-card-rail-unit-economics/README.md"
    - "?? docs/product/coin-card/COIN_CARD_IRON_FIAT_ROUTING_ARCHITECTURE_V1.md"
    - "?? docs/product/coin-card/COIN_CARD_PUBLIC_IDENTITY_AND_LEGACY_MIGRATION_V1.md"
    - "?? docs/product/coin-card/COIN_CARD_PUBLIC_REGISTRY_SOURCE_CONTRACT_V1.md"
    - "?? docs/product/coin-card/COIN_CARD_PUBLIC_USERNAME_REGISTRY_CONTRACT_V1.md"
    - "?? docs/product/coin-card/COIN_CARD_PUBLIC_USERNAME_REGISTRY_CURRENT_HEAD_CONTRACT_V1.md"
    - "?? docs/product/coin-card/coin-card.artifact.fixtures.v1.json"
    - "?? docs/product/coin-card/coin-card.artifact.negative-corpus.v1.json"
    - "?? docs/product/coin-card/coin-card.artifact.schema.v1.json"
    - "?? docs/product/coin-card/fiat-routing/COIN_CARD_MULTI_RAIL_PRODUCT_AND_ECONOMICS_STRATEGY_2026-08-08.md"
    - "?? docs/product/coin-card/fiat-routing/COIN_CARD_RAIL_UNIT_ECONOMICS_MATRIX_V1.md"
    - "?? docs/product/coin-card/fiat-routing/IRON_COIN_CARD_FIAT_RAIL_DILIGENCE_MASTER_V1.md"
    - "?? docs/product/coin-card/fiat-routing/IRON_PROVIDER_DILIGENCE_QUESTIONNAIRE_V1.md"
    - "?? docs/product/coin-card/fiat-routing/IRON_PROVIDER_VALIDATION_MATRIX_V1.md"
    - "?? docs/product/coin-card/fiat-routing/MOONPAY_AND_IRON_PROVIDER_EVALUATION_2026-08-08.md"
    - "?? firebase.routing-spike.json"
    - "?? tools/coin-card-artifact/build-and-publish-artifact.js"
    - "?? tools/coin-card-artifact/build-artifact.js"
    - "?? tools/coin-card-artifact/canonicalize.js"
    - "?? tools/coin-card-artifact/generate-fixtures.js"
    - "?? tools/coin-card-artifact/in-memory-publication-store.js"
    - "?? tools/coin-card-artifact/publication-operation-fingerprint.js"
    - "?? tools/coin-card-artifact/publish-artifact.js"
    - "?? tools/coin-card-artifact/validate-artifact.js"
    - "?? tools/coin-card-artifact/validate-lineage.js"

# ── PROHIBITED OPERATIONS ─────────────────────────────────────────────────────

prohibited_operations:
  - any Firebase mutation or configuration change
  - any GCP mutation
  - any deployment or publication
  - any networked call, HTTP probe, or external service query
  - any edit to read_only_paths or doctrine files
  - any path outside allowed_write_paths and read_only_paths
  - presenting a constructed or inferred command as authoritative where
    no authorized read_only_path demonstrates it — label CONTRACT_GAP instead
  - asserting execution authority within the runbook document itself
  - inventing neutralization semantics not derived from §12.1.3 / §12.1.1
  - staging, modifying, or reading any pre_existing_outside_manifest path
  - reading any path not in read_only_paths, even if seemingly relevant
  - relying on the pre-lane governance event reads as runbook source evidence

# ── ACCEPTANCE GATES ──────────────────────────────────────────────────────────

acceptance_gates:
  - independent PRE-WORK scope-sentinel returns GO before runbook authoring
    begins; PRE-WORK must verify the pre-lane governance event is accurately
    recorded and that no mutation occurred
  - docs/operations/ixid-m2-activation-smoke-runbook.md is created and
    complete per the objective above
  - prerequisite/stop-condition matrix (Section A) covers all listed items
  - every executable step follows precondition → procedure → expected result
    → evidence → failure/stop → next step structure
  - Section B classifies each regression command as LOCAL/STATIC,
    PRODUCTION-READ-ONLY, or PRODUCTION-MUTATING; any unresolved production
    invocation is labeled CONTRACT_GAP
  - post-smoke neutralization (Section F) is derived strictly from §12.1.3
    and §12.1.1; ambiguities are labeled CONTRACT_GAP, not papered over
  - all CONTRACT_GAP items are explicitly labeled; no unverified candidate
    command is presented as authoritative
  - the required TERMINAL SECTION explicitly disclaims execution authority
  - all runbook commands are derived from and cite authorized read_only_paths;
    no command sourced from pre-lane reads, session memory, or unlisted paths
  - no external-state mutation occurred during authoring
  - outside manifest remains mechanically stable (matches pre_existing_outside_manifest)
  - independent POST-WORK scope-sentinel returns GO
  - explicit human review and commit approval before committing

# ── EXPLICITLY OUT OF SCOPE ───────────────────────────────────────────────────

explicitly_out_of_scope:
  - executing any activation step
  - executing any smoke probe
  - Firebase step-4 configuration changes
  - Firebase email/password enablement
  - Cloud Armor attachment or verification
  - any production endpoint call
  - M3 and later milestones
  - contract amendments of any kind
  - any path outside read_only_paths and allowed_write_paths

last_human_review: "2026-08-24"
  # Metadata only. Not freshness proof or authorization.
