# CURRENT-LANE.md — M2 authority-admission implementation

lane_id: m2-authority-admission-implementation
status: ACTIVE

objective: >
  Authorize local implementation and tests for the already-specified M2
  authority-admission backend slice: enforce verified Firebase email admission
  before CREATE_ACCOUNT and REGISTER_IX_ID while preserving all frozen M1/M2
  authority, ownership, idempotency, CAS, and no-write-on-denial behavior.
  M2 remains OPEN/BLOCKED; this lane does not authorize M2 closure, production
  activation, or any M3 implementation.

transition_authority:
  mechanism: >
    Explicit human authorization in this instruction, terminator
    IXID-M2-AUTHORITY-ADMISSION-LANE-TRANSITION-12, replacing the satisfied
    m3-payment-route-contract-hardening-d1 lane after D-1 commit
    550265a3b2f30399b3c5c560ff0fd73c36998cf9.
  prior_lane_id: m3-payment-route-contract-hardening-d1
  prior_lane_satisfaction_commit: 550265a3b2f30399b3c5c560ff0fd73c36998cf9
  expected_transition_parent: 550265a3b2f30399b3c5c560ff0fd73c36998cf9
  expected_prior_lane_blob: c92b1681276716ed40de033bfdbfb8c04a925915

authoritative_baseline_commit: 550265a3b2f30399b3c5c560ff0fd73c36998cf9
starting_head_parent_commit: acb3f5f1152b795ebfe329ff105e2143873f1db2

m2_state:
  status: OPEN / BLOCKED
  authority: docs/architecture/ixid-onboarding-v0.1.md §§1.5, 12-15.1
  contract_sha256: 658d3b928e16f99a04a1de5b815084f66fef70a72599ed42442313b7cd3207fa
  statement: >
    Every M2 closure, production-activation, operational, acceptance, and
    human-observed smoke requirement remains in force. None is waived, weakened,
    bypassed, inferred complete, reclassified, or satisfied by this lane.
  blocker_containment: >
    Local authority-service implementation and tests may proceed independently.
    Cloud Armor, Firebase/external configuration, deployment, production
    activation, and human-observed acceptance remain blockers only for the
    closure/activation gates that depend on them.

implementation_scope:
  product_write_paths:
    - services/ixid_holder_authority_service.py
    - services/ixid_holder_authority_handler.py
    - services/tests/test_ixid_holder_authority_service.py
    - services/tests/test_ixid_holder_handlers.py
  write_operations: >
    Create or modify only the four listed paths for M2 authority admission and
    directly applicable tests. No speculative files or redesign are authorized.
  read_only_references:
    - CLAUDE.md
    - AGENTS.md
    - docs/agent-governance/CHARTER.md
    - docs/agent-governance/CURRENT-LANE.md
    - docs/agent-governance/FROZEN-INVARIANTS.md
    - .claude/agents/scope-sentinel.md
    - docs/architecture/ixid-onboarding-v0.1.md
    - docs/architecture/ixid-holder-authority-v0.1.md
    - services/ixid_holder_authority_service.py
    - services/ixid_holder_authority_handler.py
    - services/tests/test_ixid_holder_authority_service.py
    - services/tests/test_ixid_holder_handlers.py

allowed_paths:
  - docs/agent-governance/CURRENT-LANE.md
  - CLAUDE.md
  - AGENTS.md
  - docs/agent-governance/CHARTER.md
  - docs/agent-governance/FROZEN-INVARIANTS.md
  - .claude/agents/scope-sentinel.md
  - docs/architecture/ixid-onboarding-v0.1.md
  - docs/architecture/ixid-holder-authority-v0.1.md
  - services/ixid_holder_authority_service.py
  - services/ixid_holder_authority_handler.py
  - services/tests/test_ixid_holder_authority_service.py
  - services/tests/test_ixid_holder_handlers.py

allowed_operations:
  - read-only repository, contract, governance, and directly applicable implementation/test inspection
  - write: docs/agent-governance/CURRENT-LANE.md (this transition only, solely to install this lane)
  - stage: docs/agent-governance/CURRENT-LANE.md (this transition only)
  - create one non-amend transition commit whose changed-path set is exactly docs/agent-governance/CURRENT-LANE.md
  - after a subsequent explicit execution-hold release and independent PRE-WORK GO, create or modify only the four implementation_scope.product_write_paths
  - run directly applicable local unit/gate tests and static checks
  - invoke independent PRE-WORK and POST-WORK scope-sentinel review
  - after POST-WORK GO and separate human approval, stage/commit only reviewed product paths

acceptance_gates:
  - fresh authority/CAS baseline confirms starting HEAD 550265a3b2f30399b3c5c560ff0fd73c36998cf9 and prior committed lane blob c92b1681276716ed40de033bfdbfb8c04a925915 before the transition write
  - independent PRE-TRANSITION review of this exact candidate returns GO before the first write
  - email_verified=false causes CREATE_ACCOUNT and REGISTER_IX_ID denial with 401 and zero authority writes
  - email_verified=true preserves existing M1 authentication, account, ownership, idempotency, revision/CAS, and error semantics
  - directly applicable M2-1 through M2-10 tests pass locally; M2-11 Cloud Armor remains an external closure blocker
  - no direct browser/Firebase client authority is introduced
  - complete diff, path set, tests, and independent POST-WORK review pass
  - I-6 baseline and commit guards pass immediately before transition write/staging
  - staged transition path set is exactly docs/agent-governance/CURRENT-LANE.md
  - post-transition verification confirms sole-path commit and clean index
  - separate human approval is required before staging or commit of implementation paths

execution_hold:
  status: ACTIVE
  release_condition: >
    A subsequent explicit human instruction must identify this lane, the exact
    authorized product paths, the M2 authority-admission objective, and
    authorization through independent POST-WORK review. That instruction may
    release implementation work only; staging and commit still require separate
    explicit human approval after POST-WORK GO.
  transition_boundary: >
    Installing this lane does not release the hold and does not begin
    implementation.

quarantine:
  path: docs/architecture/ixid-payment-route-v0.1.md
  classification: PRESERVED UNAUTHORIZED RESIDUE / ZERO AUTHORITY
  statement: >
    The quarantined historical payment-route residue is not implementation or
    architectural input for this lane. Do not read, modify, stage, commit, move,
    delete, restore, or use its propositions; preserve its status entry and bytes.

explicitly_out_of_scope:
  - modification of CURRENT-LANE.md after this transition
  - modification of any doctrine or governance file
  - M2 closure or alteration of M2 completion requirements
  - production activation, Cloud Armor, Firebase, GCP, deployment, or human smoke execution
  - M3 implementation or payment-route work
  - D-1, D-2, D-3, D-4, or D-5 work
  - M4 or M6 work
  - API, persistence, Firestore, frontend, wallet, resolver, signing, KMS, or payment implementation
  - architectural redesign or opportunistic refactoring
  - unrelated product, roadmap, cleanup, or infrastructure work
  - external-state mutation, RPC, provider, network, blockchain, or production operation

builder_boundary: >
  Implementation-generated architectural questions are BLOCKERs to be reported
  for new authority. The builder must not independently redesign adjacent
  contracts or governance.

stop_conditions:
  - HEAD, parent, lane identity/blob, index, or authority drift
  - outside-manifest drift or planned-path collision
  - M2 contract identity or OPEN/BLOCKED semantics drift
  - required change outside the four authorized product paths
  - a new M2 implementation defect requiring unplanned contract change
  - implementation requires production, external configuration, deployment, RPC, or external mutation
  - frozen invariant conflict or independent reviewer ambiguity/non-GO

pre_existing_outside_manifest:
  modified_tracked_count: 10
  untracked_count: 56
  status_sha256: 59d9f154afedff2f56b3c94c7e4a5cfb00addba72493e489da61da3470f2a2d5
  comparison_rule: >
    Compare complete porcelain-v1 path/status manifests mechanically before and
    after transition, excluding only CURRENT-LANE.md; all other entries remain
    byte-for-byte identical.

independent_review_requirements:
  - PRE-TRANSITION scope review of this exact candidate returns GO
  - I-6 baseline and commit guards pass immediately before write/stage
  - POST-TRANSITION verification confirms sole CURRENT-LANE.md commit and clean index
  - future implementation requires independent PRE-WORK and POST-WORK scope review

stop_boundary: >
  After the transition commit, stop. Do not implement, stage product paths,
  transition lanes, alter doctrine, close M2, begin M3, or mutate external state.

last_human_review: "2026-08-25"
