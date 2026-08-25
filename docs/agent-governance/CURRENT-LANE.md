# CURRENT-LANE.md — M2-to-M3 contract design sequence amendment
# ================================================================
# Human-authorized governance transition. Replaces the satisfied
# governance-cas-doctrine-repair-reconciled lane. Authority derives from
# explicit human authorization in a human-controlled primary session, dated
# 2026-08-25, specifically authorizing this lane transition.

lane_id: m2-m3-contract-design-sequence-amendment
status: ACTIVE

objective: >
  Authorize a later narrowly bounded amendment to
  docs/architecture/ixid-onboarding-v0.1.md — consisting of a short normative
  milestone-sequence exception and necessary milestone annotation only — enabling
  separately authorized M3 contract recovery/design work to proceed while M2
  remains formally OPEN/BLOCKED and its existing closure requirements remain
  fully intact. This transition installs the lane only. The amendment itself
  does not begin until the human reviews this installed lane and provides a
  separate explicit instruction to begin.

transition_authority:
  mechanism: >
    Explicit human authorization in a human-controlled primary session,
    2026-08-25. Derives from the CHARTER's human lane-reconciliation and
    doctrine-amendment authority. Does not derive from any prior lane.
  prior_lane_id: governance-cas-doctrine-repair-reconciled
  prior_lane_satisfaction_commit: 158f1dc8f0061cc03b24ad25eb7b87d5abdcead4
  prior_lane_status: >
    SATISFIED — repair of docs/agent-governance/FROZEN-INVARIANTS.md and
    .claude/agents/scope-sentinel.md completed under the repair lane and
    committed at 158f1dc8f0061cc03b24ad25eb7b87d5abdcead4 (2026-08-25).

authoritative_baseline_commit: 158f1dc8f0061cc03b24ad25eb7b87d5abdcead4

m2_state:
  status: OPEN / BLOCKED
  statement: >
    M2 remains formally OPEN/BLOCKED. No existing M2 completion gate,
    acceptance requirement, production activation requirement, or smoke
    requirement is waived, weakened, satisfied by implication, or reclassified
    as complete. M2 cannot presently close because of outstanding production
    configuration, activation-authority, operational-procedure, or
    human-observed acceptance work. No new M2 implementation defect requiring
    correction is known. This lane does not alter, waive, or narrow any M2
    closure requirement.

m3_authorization_semantics:
  statement: >
    While M2 is OPEN/BLOCKED due to outstanding production configuration,
    activation-authority, operational-procedure, or human-observed acceptance
    work — and while no new M2 implementation defect requires correction —
    separately authorized M3 contract recovery/design work may proceed.
    Such contract work does not commence M3 implementation. No M3 code, API,
    persistence, wallet integration, product implementation, deployment,
    Firebase, GCP, production configuration, network operation, or
    external-state mutation is authorized by this lane. Formal M3 implementation
    remains unavailable until M2 satisfies its existing closure requirements.

execution_hold:
  status: ACTIVE
  target: docs/architecture/ixid-onboarding-v0.1.md
  condition: >
    docs/architecture/ixid-onboarding-v0.1.md must not be read for amendment
    purposes, modified, staged, or committed until the human reviews this
    installed lane and provides a new explicit instruction to begin the
    amendment. The amendment, when authorized, must be minimal: a short
    normative milestone-sequence exception and necessary milestone annotation
    only, with no restructuring of the document.

quarantine:
  path: docs/architecture/ixid-payment-route-v0.1.md
  classification: PRESERVED UNAUTHORIZED RESIDUE / ZERO AUTHORITY
  sha256_carried: 02ccc1e5c1e5a16072378b90df7c3b7090dbf06b37f561d0b7712bf94cba9f9e
  sha256_note: >
    Carried from prior verification session. Not directly read or hashed in
    this session per quarantine terms below.
  prohibition: >
    Absolutely prohibited during both this transition and the amendment phase:
    reading, hashing, editing, moving, deleting, restoring, staging, committing,
    or otherwise touching docs/architecture/ixid-payment-route-v0.1.md in any way.
    This prohibition applies to all agents and all sessions operating under this lane.

allowed_paths:
  - docs/agent-governance/CURRENT-LANE.md
  - docs/architecture/ixid-onboarding-v0.1.md

allowed_operations:
  - read-only inspection of governance doctrine, repository metadata, and committed repository files
  - write: docs/agent-governance/CURRENT-LANE.md (this transition only — installs this lane; no further writes to CURRENT-LANE.md under this lane)
  - stage: docs/agent-governance/CURRENT-LANE.md (this transition only)
  - create one non-amend transition commit whose changed-path set is exactly docs/agent-governance/CURRENT-LANE.md
  - run read-only governance validation and integrity checks relevant to this transition
  - AFTER execution hold explicitly lifted by human instruction only — read docs/architecture/ixid-onboarding-v0.1.md for amendment purposes
  - AFTER execution hold explicitly lifted by human instruction only — minimally amend docs/architecture/ixid-onboarding-v0.1.md (short normative milestone-sequence exception and necessary milestone annotation; no restructuring)
  - AFTER execution hold explicitly lifted by human instruction only — stage and commit docs/architecture/ixid-onboarding-v0.1.md in one repair commit

explicitly_out_of_scope:
  - any modification to, or amendment-purpose read of, docs/architecture/ixid-onboarding-v0.1.md before the execution hold is explicitly lifted by human instruction
  - any interaction with docs/architecture/ixid-payment-route-v0.1.md of any kind (quarantine — zero authority)
  - any waiver, weakening, satisfaction-by-implication, or reclassification of any M2 completion gate, acceptance requirement, production activation requirement, or smoke requirement
  - any M3 implementation: code, API, persistence, wallet integration, product or product-contract implementation beyond the single narrow allowed amendment, deployment
  - any Firebase, GCP, production configuration, network operation, or external-state mutation
  - docs/agent-governance/CHARTER.md
  - docs/agent-governance/FROZEN-INVARIANTS.md
  - AGENTS.md
  - CLAUDE.md
  - ".claude/agents/*"
  - any path outside allowed_paths
  - any product, application, service, test, or architecture implementation other than the single allowed amendment
  - any infrastructure, deployment, release, provider, or network operation
  - alteration, cleanup, deletion, restoration, staging, or incorporation of any pre-existing dirty or untracked worktree path
  - amending, rebasing, squashing, or rewriting any existing commit
  - restructuring, expanding, or otherwise modifying docs/architecture/ixid-onboarding-v0.1.md beyond the narrow allowed amendment
  - further writes to docs/agent-governance/CURRENT-LANE.md after this transition commit

pre_existing_outside_manifest:
  classification: PRE-EXISTING / PROVENANCE-ONLY / ZERO AUTHORITY
  status_sha256: 59d9f154afedff2f56b3c94c7e4a5cfb00addba72493e489da61da3470f2a2d5
  modified_tracked_count: 10
  untracked_count: 56
  note: >
    Carried forward from governance-cas-doctrine-repair-reconciled lane.
    SHA-256 matches live manifest computed immediately before this transition
    write. The comparison for POST-TRANSITION verification mechanically
    excludes docs/agent-governance/CURRENT-LANE.md (the transition path).
  comparison_rule: >
    PRE-TRANSITION and POST-TRANSITION must compare the complete outside
    path/status set exactly, mechanically excluding only
    docs/agent-governance/CURRENT-LANE.md. Matching status class without
    matching path is not sufficient.
  modified_tracked_paths:
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
  untracked_paths:
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
    - "?? docs/architecture/ixid-payment-route-v0.1.md"
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

acceptance_gates:
  transition_phase:
    - independent PRE-TRANSITION scope-sentinel review using committed sentinel at 158f1dc returns GO before CURRENT-LANE.md is written
    - I-6 baseline guard passes with fresh HEAD and committed lane blob pair recorded immediately before first write
    - I-6 commit guard passes immediately before staging: expected HEAD and committed lane blob still match, worktree hash equals reviewed candidate hash, index state is expected
    - staged changed-path set is exactly docs/agent-governance/CURRENT-LANE.md and no others
    - one non-amend transition commit with message "chore(governance): authorize M2-M3 contract design sequence amendment"
    - POST-TRANSITION verification confirms: committed lane blob in new HEAD equals independently reviewed candidate; committed path set is exactly docs/agent-governance/CURRENT-LANE.md; prior lane commit (158f1dc) is parent; index clean; outside manifest unchanged (10 modified + 56 untracked)
    - docs/architecture/ixid-onboarding-v0.1.md was not modified during transition
    - no product, M3, Firebase, GCP, deployment, network, provider, or external-state action occurred
    - quarantine metadata carried forward correctly; docs/architecture/ixid-payment-route-v0.1.md was not touched
  amendment_phase:
    - execution hold: no amendment begins until human reviews installed lane and provides explicit instruction
    - amendment is minimal — short normative milestone-sequence exception and necessary milestone annotation only, no restructuring
    - independent PRE-WORK and POST-WORK sentinel reviews return GO for the amendment
    - no M2 gate, requirement, or acceptance criterion is weakened or reclassified
    - outside manifest unchanged after mechanically excluding docs/architecture/ixid-onboarding-v0.1.md

stop_conditions:
  - any interaction with docs/architecture/ixid-payment-route-v0.1.md (quarantine violation — stop immediately)
  - docs/architecture/ixid-onboarding-v0.1.md is modified, staged, or committed before execution hold is explicitly lifted by human instruction
  - any M2 gate, acceptance requirement, or smoke requirement is weakened, waived, satisfied by implication, or reclassified
  - any M3 implementation action: code, API, Firebase, GCP, wallet, deployment, network, external state
  - any repository path/status drift outside the declared pre-existing boundary during transition
  - docs/agent-governance/CURRENT-LANE.md is dirty before transition write (I-6 violation)
  - I-6 baseline or commit guard fails (BLOCKED — LANE MUTEX VIOLATED)
  - committed path set after transition commit contains any path other than docs/agent-governance/CURRENT-LANE.md
  - POST-TRANSITION verification of committed lane blob fails
  - any frozen invariant is violated
  - any attempt to amend, rebase, squash, or rewrite any existing commit
  - any path outside allowed_paths is modified
  - amendment restructures or expands docs/architecture/ixid-onboarding-v0.1.md beyond the narrow normative exception and annotation

last_human_review: "2026-08-25"
  # Metadata only. Not freshness proof or authorization.
