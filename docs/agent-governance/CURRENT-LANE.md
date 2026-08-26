# CURRENT-LANE.md — M2 action-handler correction

lane_id: m2-action-handler-correction
status: ACTIVE

objective: >
  Authorize a later local correction and directly applicable tests for the
  already-frozen M2 §1.6 continueUrl behavior: absent or mismatched caller
  continueUrl values are silently ignored and the canonical
  https://app.ixid.me/register destination is used. This lane does not redesign
  M2 or authorize implementation during this transition.

transition_authority:
  mechanism: >
    Explicit human authorization under terminator
    IXID-M2-ACTION-HANDLER-LANE-TRANSITION-14, replacing the satisfied
    m2-authority-admission-implementation lane.
  prior_lane_id: m2-authority-admission-implementation
  prior_lane_satisfaction_commit: e8c374b6008a29d94080c9665207134112d25597
  expected_transition_parent: e8e820a0e1902d0028e9b3868a3f6df853bb794a
  expected_prior_lane_blob: d1e47099302178357af11537da10940d34bdf200

authoritative_baseline_commit: e8e820a0e1902d0028e9b3868a3f6df853bb794a
starting_head_parent_commit: 550265a3b2f30399b3c5c560ff0fd73c36998cf9

m2_state:
  status: OPEN / BLOCKED
  authority: docs/architecture/ixid-onboarding-v0.1.md §§1.6, 12-15.1
  contract_sha256: 658d3b928e16f99a04a1de5b815084f66fef70a72599ed42442313b7cd3207fa
  statement: >
    All M2 closure, acceptance, production-activation, operational, and
    human-observed smoke requirements remain intact. Cloud Armor, Firebase,
    deployment, and external configuration remain blockers only for dependent
    closure gates.

implementation_scope:
  product_write_paths:
    - ixid-onboarding-web/public/action.js
    - ixid-onboarding-web/tests/action-adapter.test.js
    - ixid-onboarding-web/tests/frontend-contract.test.js
  write_operations: >
    Modify only these three existing paths to correct continueUrl handling and
    directly applicable tests. No speculative files or redesign.
  read_only_references:
    - CLAUDE.md
    - AGENTS.md
    - docs/agent-governance/CHARTER.md
    - docs/agent-governance/CURRENT-LANE.md
    - docs/agent-governance/FROZEN-INVARIANTS.md
    - .claude/agents/scope-sentinel.md
    - docs/architecture/ixid-onboarding-v0.1.md
    - ixid-onboarding-web/public/action.js
    - ixid-onboarding-web/tests/action-adapter.test.js
    - ixid-onboarding-web/tests/frontend-contract.test.js

allowed_paths:
  - docs/agent-governance/CURRENT-LANE.md
  - CLAUDE.md
  - AGENTS.md
  - docs/agent-governance/CHARTER.md
  - docs/agent-governance/FROZEN-INVARIANTS.md
  - .claude/agents/scope-sentinel.md
  - docs/architecture/ixid-onboarding-v0.1.md
  - ixid-onboarding-web/public/action.js
  - ixid-onboarding-web/tests/action-adapter.test.js
  - ixid-onboarding-web/tests/frontend-contract.test.js

allowed_operations:
  - read-only repository, contract, governance, implementation, and test inspection
  - write: docs/agent-governance/CURRENT-LANE.md (this transition only)
  - stage: docs/agent-governance/CURRENT-LANE.md (this transition only)
  - create one non-amend transition commit whose changed-path set is exactly docs/agent-governance/CURRENT-LANE.md
  - after later explicit execution-hold release and independent PRE-WORK GO, modify only the three implementation_scope.product_write_paths
  - run directly applicable action-handler tests and static checks
  - invoke independent PRE-WORK and POST-WORK scope review
  - after POST-WORK GO and separate human approval, stage/commit only reviewed product paths

acceptance_gates:
  - fresh HEAD, prior lane blob, index, and outside manifest pass CAS validation
  - independent PRE-TRANSITION review returns GO before the transition write
  - M2 §1.6 lines 306-310 are preserved as the governing behavior
  - absent continueUrl is not rejected solely for being absent
  - mismatched continueUrl is ignored, not followed, and canonical registration destination is used
  - valid action behavior remains intact and tests are updated accordingly
  - only the three authorized product paths may change during future implementation
  - staged transition path set is exactly CURRENT-LANE.md and post-transition verification passes

execution_hold:
  status: ACTIVE
  release_condition: >
    A subsequent explicit human instruction must identify this lane, the exact
    three product paths, the M2 continueUrl correction, and authorization through
    independent PRE-WORK and POST-WORK review. Staging and commit still require
    separate human approval after POST-WORK GO.
  transition_boundary: >
    Installing this lane does not release the hold or begin implementation.

quarantine:
  path: docs/architecture/ixid-payment-route-v0.1.md
  classification: PRESERVED UNAUTHORIZED RESIDUE / ZERO AUTHORITY
  statement: >
    Preserve the quarantined source status and bytes. Do not read, modify, move,
    delete, restore, stage, commit, or use it as authority.

explicitly_out_of_scope:
  - modification of CURRENT-LANE.md after this transition or any doctrine file
  - M2 closure changes or production activation
  - D-1 through D-5, M3, M4, or M6 work
  - unrelated frontend/backend work, redesign, or refactoring
  - deployment, Firebase/GCP/Cloud Armor/provider/network/RPC/blockchain mutation
  - external-state mutation or production operation

builder_boundary: >
  The builder corrects the existing contract discrepancy only. Any need to
  change the frozen contract or a fourth path is a BLOCKER requiring new authority.

stop_conditions:
  - repository, lane, index, HEAD, CAS, or outside-manifest drift
  - planned-path collision or required change outside the three paths
  - M2 semantic drift or frozen-invariant conflict
  - implementation/deployment/external dependency
  - reviewer ambiguity or non-GO

pre_existing_outside_manifest:
  modified_tracked_count: 10
  untracked_count: 56
  status_sha256: 59d9f154afedff2f56b3c94c7e4a5cfb00addba72493e489da61da3470f2a2d5
  comparison_rule: >
    Compare complete porcelain-v1 manifests mechanically before and after this
    transition, excluding only CURRENT-LANE.md; all other entries remain identical.

independent_review_requirements:
  - PRE-TRANSITION scope review of this exact candidate returns GO
  - I-6 baseline and commit guards pass immediately before write and staging
  - post-transition verification confirms sole-path commit and clean index
  - future implementation requires independent PRE-WORK and POST-WORK review

stop_boundary: >
  After the transition commit, stop. Do not implement the action handler, modify
  product paths, release the hold, transition lanes, or perform external mutation.

last_human_review: "2026-08-26"
