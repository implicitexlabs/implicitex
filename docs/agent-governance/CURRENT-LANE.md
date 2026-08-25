lane_id: governance-lane-transition-cas-repair
status: ACTIVE

# CURRENT-LANE.md — Governance: CAS doctrine repair
# ===================================================
# Doctrine repair lane. Reconstructs FROZEN-INVARIANTS.md and
# scope-sentinel.md from the 82d77a6 known-good doctrine baseline
# plus the final human-approved I-6 semantics, thereby superseding
# the non-authoritative doctrine delta in 699e5ab.
# No product work. No Firebase/GCP activity. No deployment.
#
# Human authorization: 2026-08-24. Explicit instruction:
# "Proceed with a forward doctrine-repair lane.
#  governance-lane-transition-cas-repair
#  Baseline: 699e5ab827f264ddb92f7c38096c05794c943323
#  Reconstruct from 82d77a6 doctrine + final approved I-6 semantics."
#
# CURRENT-LANE.md is fail-closed (I-1). If this file is missing, malformed,
# internally contradictory, or does not authorize the requested work,
# scope-sentinel must return BLOCKED. No best-effort interpretation permitted.

# ── TRANSITION GUARD EVIDENCE ────────────────────────────────────────────────
#
# Fresh reconciliation performed immediately before this write.
# This session is designated sole authorized writer to main worktree.
#
# Baseline established at reconciliation time:
#   cas_expected_head:              699e5ab827f264ddb92f7c38096c05794c943323
#   cas_expected_committed_blob:    2a9585d9d4a2bd9a1aad6b83e4d972fb6237a369
#     (committed blob = m2-governance-correction state; HEAD had not advanced)
#   worktree_stale_residue_hash:    965b2e5ca81ee8ff80f4672e982e48733b67150f
#     (second stale uncommitted governance residue — authorized replacement)
#
# Re-verified immediately before write (same command run):
#   cas_observed_head:              699e5ab827f264ddb92f7c38096c05794c943323
#   cas_observed_committed_blob:    2a9585d9d4a2bd9a1aad6b83e4d972fb6237a369
#   cas_match:                      PASS
#
# Authorized replacement: this write replaces only the known stale residue
# 965b2e5c. It does not authorize cleaning or modifying any other path.

# ── PROVENANCE RECORD ────────────────────────────────────────────────────────

provenance:
  out_of_lane_mutation:
    commit: 699e5ab827f264ddb92f7c38096c05794c943323
    classification: OUT-OF-LANE DOCTRINE MUTATION / NON-AUTHORITATIVE / PRESERVE IN HISTORY
    reason: >
      The CAS-amendment lane (governance-lane-transition-cas-amendment) was
      never committed or ACTIVE when 699e5ab was produced. No authorized lane
      existed to authorize writes to FROZEN-INVARIANTS.md or scope-sentinel.md.
    changed_paths:
      - docs/agent-governance/FROZEN-INVARIANTS.md
      - .claude/agents/scope-sentinel.md
    forensic_classification:
      match: 5       # BLOCKED/BLOCKER labels, governance-only scope, no TTL,
                     # HEAD check, committed blob check
      partial: 1     # baseline guard (present but missing clean-state check)
      missing: 4     # commit guard, candidate/worktree hash check,
                     # index-state check, effective-commit scope
      contradictory: 1  # trigger uses allowed_write_paths, not operation
    adoption_policy: >
      No content from 699e5ab is adopted merely because it agrees with the
      approved design. Reconstruction authority comes from the 82d77a6
      known-good doctrine plus the human-approved final I-6 requirements.
      699e5ab is used only as forensic comparison after reconstruction.

  stale_worktree_residues:
    first:
      hash: 23bebdd12cd4b6346ab48dd1e5da40e507db2f91
      classification: FIRST STALE UNCOMMITTED GOVERNANCE CANDIDATE / ZERO AUTHORITY
      content: governance-lane-transition-cas-amendment candidate (this session)
    second:
      hash: 965b2e5ca81ee8ff80f4672e982e48733b67150f
      classification: SECOND STALE UNCOMMITTED GOVERNANCE RESIDUE / ZERO AUTHORITY
      content: m3-payment-route-contract candidate with non-authoritative CAS evidence
      note: >
        CAS evidence in this residue used worktree blob 23bebdd1 as baseline
        instead of committed blob 2a9585d9. Procedural divergence; not adopted.

# ── BOOTSTRAP REPAIR AUTHORITY ───────────────────────────────────────────────
#
# This is a narrowly authorized doctrine-recovery exception.
#
# The committed versions of .claude/agents/scope-sentinel.md and
# docs/agent-governance/FROZEN-INVARIANTS.md at HEAD 699e5ab are classified
# OUT-OF-LANE DOCTRINE MUTATION / NON-AUTHORITATIVE. They may not serve as
# the governing authority for this repair lane — that would be a circularity:
# the invalid sentinel approving its own repair.
#
# PRE-WORK authority for this repair lane:
#   - .claude/agents/scope-sentinel.md    → 82d77a6 version (git show 82d77a6:.claude/agents/scope-sentinel.md)
#   - docs/agent-governance/FROZEN-INVARIANTS.md → 82d77a6 version (git show 82d77a6:docs/agent-governance/FROZEN-INVARIANTS.md)
#   - docs/agent-governance/CHARTER.md   → current HEAD version
#   - AGENTS.md                          → current HEAD version
#   - CLAUDE.md                          → current HEAD version
#     (PRE-WORK must confirm these three were not changed by 699e5ab;
#      forensic inspection confirms 699e5ab changed only FROZEN-INVARIANTS.md
#      and scope-sentinel.md)
#   - this human-authorized repair lane record = additional explicit authority
#     for the reconstruction
#
# The current 699e5ab versions of FROZEN-INVARIANTS.md and scope-sentinel.md
# are forensic inputs only. They grant no PRE-WORK or POST-WORK authority.
#
# Once the repair is committed, the newly committed I-6/scope-sentinel becomes
# authoritative for all subsequent CURRENT-LANE.md transitions, including
# closure of this repair lane.

bootstrap_repair_authority:
  governing_sentinel_version: git show 82d77a6:.claude/agents/scope-sentinel.md
  governing_invariants_version: git show 82d77a6:docs/agent-governance/FROZEN-INVARIANTS.md
  additional_authority: human-approved repair lane record (this file)
  tainted_versions_role: forensic_only
  exception_scope: >
    Applies only to PRE-WORK and POST-WORK evaluation of this repair lane.
    Does not extend to any other lane or future transition.

objective: >
  Reconstruct docs/agent-governance/FROZEN-INVARIANTS.md and
  .claude/agents/scope-sentinel.md from:

    82d77a6 known-good doctrine + final human-approved I-6 semantics

  Derivation authority:
    - Read the 82d77a6 versions of both files as the authoritative clean base
    - Apply only the final approved I-6 specification (documented below)
    - Compare result against 699e5ab delta forensically only, after reconstruction
    - Do not use 699e5ab content as the starting authority for either file

  Final approved I-6 specification:

  (a) TRIGGER — I-6 applies whenever any operation proposes to create,
      replace, amend, close, supersede, restore, or otherwise write
      docs/agent-governance/CURRENT-LANE.md. The trigger is the proposed
      operation. A transition not listed in allowed_write_paths is not exempt.

  (b) BASELINE GUARD — immediately before the first transition write:
        1. CURRENT-LANE.md must have no pre-existing staged or unstaged
           change attributable to another transition;
        2. record expected HEAD (git rev-parse HEAD);
        3. record expected committed lane blob
           (git rev-parse HEAD:docs/agent-governance/CURRENT-LANE.md);
        4. re-read both immediately before the first write;
        5. mismatch → BLOCKED — LANE MUTEX VIOLATED.

  (c) COMMIT GUARD — immediately before staging/committing the transition:
        1. re-read expected HEAD;
        2. re-read expected committed lane blob;
        3. verify worktree CURRENT-LANE.md hash equals reviewed candidate hash;
        4. verify no unexpected index state;
        5. any mismatch → BLOCKED — LANE MUTEX VIOLATED.

  (d) After BLOCKED — LANE MUTEX VIOLATED: no write, stage, commit, reset,
      checkout, restore, or automatic reconciliation of CURRENT-LANE.md
      permitted. Session must inspect intervening commits, reconcile
      authority, and obtain any newly required human authorization before
      establishing a new expected pair.

  (e) I-6 governs CURRENT-LANE.md transitions only. Does not apply to
      authorized implementation commits within an already-active lane.

  (f) No TTL, timestamp freshness rule, or session-age rule.

  (g) EFFECTIVE-COMMIT SCOPE — I-6 does not invalidate transitions committed
      before the I-6 effective commit. Every CURRENT-LANE.md transition
      performed after the effective commit must comply with I-6, including
      transitions that close, amend, or supersede lanes opened before I-6.

  scope-sentinel.md must be amended to:
    (a) add Governance transition CAS evidence block to Step 3, triggered
        by any proposed CURRENT-LANE.md write (not allowed_write_paths);
    (b) require both baseline guard and commit guard evidence fields;
    (c) add BLOCKED — LANE MUTEX VIOLATED for cas_baseline_match: FAIL
        or cas_commit_match: FAIL;
    (d) add BLOCKER — INSUFFICIENT CAS EVIDENCE for absent inputs;
    (e) add I-6 row to Step 6 table: PASS / FAIL / N/A
        (N/A only when no CURRENT-LANE.md write is proposed or evaluated).

authoritative_baseline_commit: 699e5ab827f264ddb92f7c38096c05794c943323

allowed_write_paths:
  - docs/agent-governance/FROZEN-INVARIANTS.md
  - .claude/agents/scope-sentinel.md

read_only_paths:
  - docs/agent-governance/CHARTER.md
  - AGENTS.md
  - CLAUDE.md

# Note: allowed_write_paths implicitly requires reading those files.
# The 82d77a6 versions are the reconstruction baseline; the 699e5ab versions
# are forensic comparators. Both are accessed via git show, not worktree reads,
# to avoid any ambiguity about which version is authoritative.

# ── PRE-EXISTING OUTSIDE MANIFEST ────────────────────────────────────────────

pre_existing_outside_manifest:
  classification: PRE-EXISTING / provenance-only
  baseline_commit: 699e5ab827f264ddb92f7c38096c05794c943323
  scope: >
    10 modified tracked Coin Card/infrastructure files, CURRENT-LANE.md dirty
    in worktree (second stale residue 965b2e5c — replaced by this lane
    transition), and 56 untracked files (including the SUPERSEDED-M3 residue
    docs/architecture/ixid-payment-route-v0.1.md).

    After this lane-opening commit, CURRENT-LANE.md will be clean (committed
    = worktree). The remaining outside manifest is unchanged.

    All outside paths grant zero read, write, stage, or commit authority
    inside this lane. POST-WORK must compare the exact path/status set.
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

# ── PROHIBITED OPERATIONS ─────────────────────────────────────────────────────

prohibited_operations:
  - any product implementation (JavaScript, Python, or otherwise)
  - any Firebase or GCP mutation
  - any deployment
  - any changes outside allowed_write_paths
  - adopting content from 699e5ab as reconstruction authority
  - adopting content from either stale worktree residue (23bebdd1, 965b2e5c)
  - any TTL, timestamp freshness, or session-age rule in I-6
  - reading docs/architecture/ixid-payment-route-v0.1.md
  - reading or modifying any outside-manifest path

# ── ACCEPTANCE GATES ──────────────────────────────────────────────────────────

acceptance_gates:
  - BOOTSTRAP PRE-WORK GO — independent review performed against the 82d77a6
    scope-sentinel and FROZEN-INVARIANTS doctrine baseline plus this
    human-authorized repair lane record; the 699e5ab doctrine delta is not
    used as governing authority; PRE-WORK must confirm:
      (a) provenance record in this lane is accurate;
      (b) lane opening changed only docs/agent-governance/CURRENT-LANE.md
          and produced no other repository or external-state mutation;
      (c) CHARTER.md, AGENTS.md, CLAUDE.md were not changed by 699e5ab;
      (d) outside manifest matches the declared baseline
  - 82d77a6 versions of both repair targets read fresh after PRE-WORK GO
    via git show 82d77a6:.claude/agents/scope-sentinel.md and
    git show 82d77a6:docs/agent-governance/FROZEN-INVARIANTS.md
    (not worktree reads; not 699e5ab worktree versions)
  - reconstruction produces FROZEN-INVARIANTS.md and scope-sentinel.md
    equivalent to: 82d77a6 baseline + final approved I-6 per objective (a)–(g)
  - forensic comparison against 699e5ab delta performed after reconstruction
    to identify any unintentional divergence or unintentional inheritance
  - exact diff against 82d77a6 baseline presented for human review
    before committing
  - no change to docs/architecture/ixid-payment-route-v0.1.md
  - outside manifest stable (10 modified tracked + 56 untracked;
    CURRENT-LANE.md clean after lane-opening commit)
  - BOOTSTRAP POST-WORK GO — independent review under the same 82d77a6
    recovery authority confirming:
      (a) reconstructed files match 82d77a6 baseline + approved I-6;
      (b) the reconstructed files are fully derivable from the 82d77a6
          baseline plus the approved I-6 specification; any textual overlap
          with 699e5ab is incidental and grants no authority;
      (c) exact scope and outside-manifest checks pass;
      (d) no other path was modified
  - once repair is committed, closure of this repair lane uses the newly
    committed I-6/scope-sentinel as governing authority (no longer bootstrap)
  - explicit human commit approval

last_human_review: "2026-08-24"
  # Metadata only. Not freshness proof or authorization.
