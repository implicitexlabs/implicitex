# CURRENT-LANE.md — Reconciled governance CAS doctrine repair
# ============================================================
# This is a new human-authorized control-plane replacement for the malformed
# governance-lane-transition-cas-repair record committed at 2af7101.
# The replacement transition derives from the 82d77a6 Charter's human lane-
# reconciliation and doctrine-amendment authority. It does not derive from the
# malformed prior lane and does not claim that I-6/CAS governs this transition.

lane_id: governance-cas-doctrine-repair-reconciled
status: ACTIVE

objective: >
  Repair the governance CAS doctrine by reconstructing only
  docs/agent-governance/FROZEN-INVARIANTS.md and
  .claude/agents/scope-sentinel.md from the known-good 82d77a6 baseline plus
  the previously human-approved I-6/CAS semantics, without changing product
  code, CHARTER, CURRENT-LANE, external state, or unrelated repository work.

transition_authority:
  mechanism: >
    Explicit human authorization in a human-controlled primary session under
    the known-good 82d77a6 Charter's human lane-reconciliation and doctrine-
    amendment authority.
  known_good_doctrine_commit: 82d77a6d042fd71d931d4c9f276ec371cf680153
  expected_parent_commit: 2af710162d0056ef5a69253280cfb1b71fc56f32
  prior_lane_id: governance-lane-transition-cas-repair
  prior_lane_authority: MALFORMED / NON-AUTHORITATIVE
  transition_scope: >
    A dedicated non-merge commit changing only
    docs/agent-governance/CURRENT-LANE.md to install this exact human-approved
    replacement record.
  cas_status: >
    I-6/CAS is not governing authority for this replacement transition. CAS
    doctrine is the subject of the subsequent two-file repair.

authoritative_baseline_commit: 82d77a6d042fd71d931d4c9f276ec371cf680153

bootstrap_review_authority:
  governing_sentinel: 82d77a6d042fd71d931d4c9f276ec371cf680153:.claude/agents/scope-sentinel.md
  governing_invariants: 82d77a6d042fd71d931d4c9f276ec371cf680153:docs/agent-governance/FROZEN-INVARIANTS.md
  governing_charter: 82d77a6d042fd71d931d4c9f276ec371cf680153:docs/agent-governance/CHARTER.md
  tainted_head_versions_role: FORENSIC ONLY
  approved_amendment_rule: >
    Use only the exact I-6/CAS semantics previously approved by the human.
    This lane neither restates nor alters those semantics. If the exact
    approved semantics cannot be established, stop without modifying either
    allowed path.

allowed_paths:
  - docs/agent-governance/FROZEN-INVARIANTS.md
  - .claude/agents/scope-sentinel.md

allowed_operations:
  - read-only inspection of governance doctrine, repository metadata, and historical blobs needed to reconstruct and validate the two allowed paths
  - reconstruct each allowed path from its exact 82d77a6 version plus only the exact previously human-approved I-6/CAS amendment
  - modify: docs/agent-governance/FROZEN-INVARIANTS.md
  - modify: .claude/agents/scope-sentinel.md
  - stage: docs/agent-governance/FROZEN-INVARIANTS.md
  - stage: .claude/agents/scope-sentinel.md
  - run read-only governance validation, diff checks, and tests relevant to the two allowed paths
  - after independent POST-WORK validation and explicit human commit approval, create one repair commit whose changed-path set is exactly the two allowed paths

explicitly_out_of_scope:
  - docs/agent-governance/CURRENT-LANE.md after this transition commit
  - docs/agent-governance/CHARTER.md
  - AGENTS.md
  - CLAUDE.md
  - every doctrine change other than the approved I-6/CAS amendment to the two allowed paths
  - all product, application, service, contract, test, and architecture implementation
  - all infrastructure, Firebase, GCP, deployment, release, provider, network, and external-state operations
  - alteration, cleanup, deletion, restoration, staging, or incorporation of any pre-existing dirty or untracked worktree path
  - any path outside allowed_paths
  - using 699e5ab, 2af7101, or stale worktree residue as reconstruction authority
  - treating I-6/CAS as governing authority for the transition that installs this lane
  - amending, rebasing, squashing, or rewriting any existing commit

pre_existing_outside_manifest:
  classification: PRE-EXISTING / PROVENANCE-ONLY / ZERO AUTHORITY
  status_sha256: 59d9f154afedff2f56b3c94c7e4a5cfb00addba72493e489da61da3470f2a2d5
  modified_tracked_count: 10
  untracked_count: 56
  comparison_rule: >
    PRE-WORK and POST-WORK must compare the complete path/status set exactly.
    During repair, mechanically exclude only the two allowed paths before
    comparison. Matching status class without matching path is not sufficient.
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
  - independent PRE-WORK review under the 82d77a6 scope-sentinel and frozen-invariants baseline returns GO before either allowed path is modified
  - both repaired files are reconstructed from their exact 82d77a6 versions plus only the exact previously human-approved I-6/CAS amendment
  - neither 699e5ab nor 2af7101 content is used as reconstruction authority; any comparison with those commits is forensic and occurs only after reconstruction
  - the repaired scope-sentinel retains the exact baseline required-field schema and remains fail-closed for missing, malformed, contradictory, stale, or unauthorized lanes
  - no governance semantic changes occur beyond the exact approved I-6/CAS amendment
  - exact diffs against both 82d77a6 baseline files are presented for human review before staging or committing
  - governance validation, schema checks, behavior checks, and diff checks relevant to the two allowed paths pass
  - independent POST-WORK review under the 82d77a6 bootstrap authority returns GO before staging or committing
  - the complete outside-manifest path/status set remains exactly unchanged after mechanically excluding only the two allowed paths
  - the staged and committed changed-path set is exactly both allowed paths and no others
  - explicit human commit approval is received after review of the final diff and before the repair commit
  - no repository path outside allowed_paths and no external state is changed

stop_conditions:
  - any repository path/status drift outside the declared pre-existing boundary
  - either allowed path is dirty before PRE-WORK begins
  - uncertainty about the exact previously human-approved I-6/CAS semantics
  - any need to modify, create, delete, restore, stage, or commit a path outside allowed_paths
  - any validation, schema, behavior, test, or diff-check failure that cannot be resolved within the two allowed paths
  - discovery that the proposed repair would alter governance semantics beyond the exact approved I-6/CAS amendment
  - any attempt to use 699e5ab, 2af7101, or stale worktree residue as reconstruction authority
  - any change to docs/agent-governance/CURRENT-LANE.md after this transition commit
  - any product, application, infrastructure, deployment, Firebase, GCP, provider, network, or external-state operation
  - any staging or commit before independent POST-WORK review and explicit human commit approval
  - any frozen invariant would be violated

last_human_review: "2026-08-24"
  # Metadata only. Not freshness proof or authorization.
