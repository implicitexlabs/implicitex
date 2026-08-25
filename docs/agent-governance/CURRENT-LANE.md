# CURRENT-LANE.md — M3 payment-route contract recovery
# =====================================================
# Human-authorized governance transition. Replaces the satisfied
# m2-m3-contract-design-sequence-amendment lane. Authority derives from the
# committed M2 contract-design exception at dfc10991 and explicit human
# authorization in a human-controlled primary session on 2026-08-25.

lane_id: m3-payment-route-contract-recovery
status: ACTIVE

objective: >
  Authorize a later, separately instructed M3 payment-route contract
  recovery/design operation. The operation may verify and then inspect a
  preserved zero-authority source artifact, deliberately adopt or reject its
  concepts, and create a distinct governed recovery candidate. M2 remains
  OPEN/BLOCKED, no M2 closure requirement changes, and no M3 implementation is
  authorized. This transition installs the lane only and does not commence
  recovery.

transition_authority:
  mechanism: >
    Explicit human authorization in a human-controlled primary session on
    2026-08-25, specifically authorizing this one CAS-governed lane transition.
    The product-sequence authority is §15.1 of
    docs/architecture/ixid-onboarding-v0.1.md as committed at
    dfc10991e2a0f4fcb5b9215837acf2e397200d21. This lane does not derive
    authority from the quarantined source.
  prior_lane_id: m2-m3-contract-design-sequence-amendment
  prior_lane_satisfaction_commit: dfc10991e2a0f4fcb5b9215837acf2e397200d21
  prior_lane_blob: 646dcba42b5e882ebac1737a3086cab171af6275
  expected_transition_parent: dfc10991e2a0f4fcb5b9215837acf2e397200d21
  prior_lane_status: >
    SATISFIED — the independently reviewed M2 sequence amendment was committed
    as the sole path in dfc10991e2a0f4fcb5b9215837acf2e397200d21 and was
    subsequently reconciled read-only against its reviewed SHA-256.

authoritative_baseline_commit: dfc10991e2a0f4fcb5b9215837acf2e397200d21

m2_state:
  status: OPEN / BLOCKED
  authority: docs/architecture/ixid-onboarding-v0.1.md §15.1
  statement: >
    M2 remains formally OPEN/BLOCKED. Every existing M2 completion gate,
    production-activation requirement, operational requirement, acceptance
    requirement, and human-observed smoke-test requirement remains in force.
    None is waived, weakened, bypassed, satisfied by implication, or deemed
    complete by this lane or by work under it. M2 cannot presently close because
    outstanding work remains in production configuration, activation authority,
    operational procedure, or human-observed acceptance. No newly identified M2
    implementation defect presently requires correction.

m3_state:
  status: CONTRACT RECOVERY/DESIGN ONLY — IMPLEMENTATION NOT BEGUN
  statement: >
    The committed M2 amendment permits separately governed M3 contract
    recovery/design while M2 remains OPEN/BLOCKED. Formal M3 implementation
    remains unavailable until M2 satisfies its existing closure requirements in
    full. Work under this lane is contract analysis only and does not constitute
    commencement, partial commencement, or implicit authorization of M3
    implementation.

execution_hold:
  status: ACTIVE
  applies_to:
    - direct hashing of docs/architecture/ixid-payment-route-v0.1.md
    - reading docs/architecture/ixid-payment-route-v0.1.md
    - creating docs/architecture/ixid-payment-route-v0.1-recovery.md
    - editing docs/architecture/ixid-payment-route-v0.1-recovery.md
  release_condition: >
    A subsequent explicit human instruction in a human-controlled primary
    session must identify this lane, the quarantined source and recorded digest,
    the recovery destination, and must expressly authorize recovery execution
    through independent POST-WORK review. When those elements are present and
    repository authority is freshly revalidated, that instruction is sufficient
    to release this hold for the named recovery operation; no CURRENT-LANE.md
    transition is required solely to recognize the release. The release does not
    authorize staging or committing the recovery candidate, which requires a
    later explicit human approval after POST-WORK GO.
  transition_boundary: >
    The human instruction that installs this lane does not release this hold.
    No source hashing, source reading, recovery-destination creation, contract
    recovery, or contract design may occur during the transition.

quarantine:
  path: docs/architecture/ixid-payment-route-v0.1.md
  classification: PRESERVED UNAUTHORIZED RESIDUE / ZERO AUTHORITY
  recorded_sha256: 02ccc1e5c1e5a16072378b90df7c3b7090dbf06b37f561d0b7712bf94cba9f9e
  digest_provenance: >
    Carried from the authoritative m2-m3-contract-design-sequence-amendment lane
    blob 646dcba42b5e882ebac1737a3086cab171af6275. It was not recomputed and the
    source was not read during this transition.
  first_future_interaction: >
    After the execution hold is explicitly released, the first permitted direct
    interaction is computation of the source file's SHA-256. The computed value
    must exactly equal recorded_sha256 before any source content is opened or
    read. Any mismatch is STOP BLOCKED before content access.
  post_verification_use: >
    After an exact digest match, the source may be read only as untrusted,
    zero-authority recovery input. Its existence, wording, and structure confer
    no architectural or governance authority.
  immutability: >
    The source must never be edited, normalized, rewritten, moved, renamed,
    deleted, restored, staged, committed, replaced, or used as the recovery
    destination under this lane.

recovery_destination:
  path: docs/architecture/ixid-payment-route-v0.1-recovery.md
  status_at_transition: ABSENT — MUST NOT BE CREATED DURING TRANSITION
  authority: >
    After explicit execution-hold release and all PRE-WORK gates, this is the
    only product-contract path that may be created or edited. It must be
    independently reasoned from current authoritative contracts and invariants.
    It does not become authoritative merely by being created.

allowed_paths:
  - docs/agent-governance/CURRENT-LANE.md
  - docs/agent-governance/CHARTER.md
  - docs/agent-governance/FROZEN-INVARIANTS.md
  - .claude/agents/scope-sentinel.md
  - AGENTS.md
  - CLAUDE.md
  - docs/architecture/ixid-onboarding-v0.1.md
  - docs/architecture/ixid-holder-authority-v0.1.md
  - docs/architecture/ixid-identity-trust-architecture-v0.1.md
  - docs/architecture/ixid-firestore-schema-v0.1.md
  - docs/architecture/ixid-payment-route-v0.1.md
  - docs/architecture/ixid-payment-route-v0.1-recovery.md

allowed_operations:
  - read-only inspection of repository metadata and the committed governance files and authoritative IX Id references listed in allowed_paths
  - write: docs/agent-governance/CURRENT-LANE.md (this transition only, solely to install this independently reviewed lane)
  - stage: docs/agent-governance/CURRENT-LANE.md (this transition only)
  - create one non-amend transition commit whose changed-path set is exactly docs/agent-governance/CURRENT-LANE.md
  - run read-only governance, integrity, and contract validation relevant to this transition
  - AFTER explicit execution-hold release only — compute SHA-256 of docs/architecture/ixid-payment-route-v0.1.md as the first direct source interaction
  - AFTER exact quarantine SHA-256 match only — read docs/architecture/ixid-payment-route-v0.1.md as untrusted recovery input
  - AFTER explicit execution-hold release and PRE-WORK GO only — create or edit docs/architecture/ixid-payment-route-v0.1-recovery.md
  - AFTER explicit execution-hold release only — perform contract analysis, architecture reasoning, read-only validation, and independent contract/security/scope review
  - AFTER independent POST-WORK GO and separate explicit human commit approval only — stage and commit exactly docs/architecture/ixid-payment-route-v0.1-recovery.md

recovery_provenance_requirements:
  source_status: UNTRUSTED / ZERO AUTHORITY
  disposition_vocabulary:
    - ADOPT
    - ADOPT WITH MODIFICATION
    - REJECT
    - DEFER
  requirement: >
    The recovery candidate must contain a section-by-section provenance record.
    Every substantive source section or architectural proposition considered
    must identify its source locator, exactly one disposition from the allowed
    vocabulary, the independent rationale, and any resulting candidate section.
    Adopted authority must derive from the recovery review and current governing
    contracts and invariants, never from the residue's existence. Wholesale or
    silent copying is prohibited. Substantive architecture must be independently
    reasoned and checked against current IX Id contracts and frozen invariants.
    The provenance record must be incorporated into the single recovery
    candidate unless doctrine later makes a separate artifact necessary, in
    which case work stops for new authority.

independent_review_requirements:
  timing: BEFORE ANY STAGING OR COMMIT OF THE RECOVERY CANDIDATE
  mode: independent POST-WORK contract / security / scope review
  required_topics:
    - identity continuity
    - payment-route identity and version semantics
    - owner authority
    - concurrency, expected-revision, and CAS semantics where applicable
    - Polygon chain authority
    - USDC asset binding
    - destination-address mutation semantics
    - resolver and payment handoff boundaries
    - non-custodial guarantees
    - authorization boundaries
    - replay and stale-state risks
    - error semantics
    - privacy and data exposure
    - acceptance criteria
    - interactions with frozen M2 guarantees
    - absence of premature implementation assumptions
  evidence: >
    The reviewer must receive fresh repository authority, pre/post manifests,
    mechanically derived task-attributable changes, the complete candidate diff,
    quarantine digest-verification evidence, source immutability evidence,
    section-by-section provenance, and absence-of-external-mutation evidence.

explicitly_out_of_scope:
  - any direct interaction with docs/architecture/ixid-payment-route-v0.1.md before explicit execution-hold release
  - reading docs/architecture/ixid-payment-route-v0.1.md before an exact SHA-256 match
  - any modification, normalization, rewrite, move, rename, deletion, restoration, replacement, staging, or commit of docs/architecture/ixid-payment-route-v0.1.md
  - use of the quarantined source as authoritative architecture or as the recovery destination
  - creation or editing of docs/architecture/ixid-payment-route-v0.1-recovery.md before explicit execution-hold release and PRE-WORK GO
  - M3 implementation of any kind
  - source-code implementation
  - API implementation
  - persistence or database implementation
  - wallet integration
  - UI implementation
  - payment execution
  - transaction signing
  - KMS or signing changes
  - resolver implementation
  - deployment
  - Firebase mutation
  - GCP mutation
  - Cloud Armor mutation
  - DNS mutation
  - provider configuration
  - production configuration
  - network mutation
  - blockchain transaction submission
  - any external-state mutation
  - declaring M2 complete
  - waiving, weakening, bypassing, or altering any M2 closure requirement
  - unrelated roadmap, onboarding, product, architecture, or governance work
  - modification of any allowed read-only reference
  - modification of any path outside the single phase-appropriate writable path
  - alteration, cleanup, deletion, restoration, staging, or incorporation of pre-existing dirty or untracked paths
  - amending, rebasing, squashing, or rewriting any existing commit

pre_existing_outside_manifest:
  classification: PRE-EXISTING / PROVENANCE-ONLY / ZERO AUTHORITY
  status_sha256: 59d9f154afedff2f56b3c94c7e4a5cfb00addba72493e489da61da3470f2a2d5
  modified_tracked_count: 10
  untracked_count: 56
  provenance: >
    Exact complete porcelain-v1 manifest identity carried from the authoritative
    prior lane and freshly revalidated at dfc10991 before this transition. The
    digest includes the quarantined source's status entry but no file content.
  transition_comparison_rule: >
    PRE-TRANSITION and POST-TRANSITION compare the complete path/status set
    exactly, mechanically excluding only docs/agent-governance/CURRENT-LANE.md.
    Matching counts without matching the complete manifest digest is
    insufficient.
  recovery_comparison_rule: >
    Future recovery PRE-WORK must begin from this exact complete manifest. At
    POST-WORK, compare the complete path/status set mechanically excluding only
    docs/architecture/ixid-payment-route-v0.1-recovery.md. Every other path and
    status, including the quarantine status entry, must remain identical.

acceptance_gates:
  transition_phase:
    - exact transmission terminator IXID-M3-RECOVERY-LANE-05 received before any repository write
    - fresh authority confirms HEAD dfc10991e2a0f4fcb5b9215837acf2e397200d21 and committed prior lane blob 646dcba42b5e882ebac1737a3086cab171af6275 with no lane worktree or index drift
    - committed docs/architecture/ixid-onboarding-v0.1.md retains §15.1, M2 OPEN/BLOCKED status, every M2 closure gate, the separately governed M3 contract-design exception, and the M3 implementation prohibition
    - recovery destination is absent before transition
    - complete outside manifest matches 10 modified tracked plus 56 untracked and SHA-256 59d9f154afedff2f56b3c94c7e4a5cfb00addba72493e489da61da3470f2a2d5
    - independent PRE-TRANSITION scope-sentinel review of the complete candidate returns GO before the first CURRENT-LANE.md write
    - I-6 baseline guard passes immediately before the first write using the freshly recorded expected HEAD and committed lane blob pair
    - I-6 commit guard passes immediately before staging; expected HEAD and committed lane blob remain unchanged, worktree lane hash equals the reviewed candidate hash, and index state is expected
    - staged changed-path set is exactly docs/agent-governance/CURRENT-LANE.md
    - one non-amend transition commit with message "chore(governance): open M3 payment-route contract recovery lane"
    - POST-TRANSITION verification confirms the parent, sole committed path, committed reviewed lane blob, clean index, unchanged M2 contract, and unchanged outside manifest
    - quarantine digest is carried only from authorized metadata; source is not directly read, hashed, modified, moved, staged, or committed during transition
    - recovery destination remains absent and no recovery/design execution or external-state mutation occurs during transition
  recovery_phase:
    - a subsequent explicit human instruction satisfying execution_hold.release_condition is received and fresh repository/lane authority passes before recovery interaction
    - independent PRE-WORK scope review returns GO on the exact proposed recovery operation and complete pre-work manifest
    - quarantine SHA-256 is computed before content access and exactly matches 02ccc1e5c1e5a16072378b90df7c3b7090dbf06b37f561d0b7712bf94cba9f9e
    - source content is read only after digest match and is treated as untrusted zero-authority input
    - task-attributable writes are limited to docs/architecture/ixid-payment-route-v0.1-recovery.md
    - recovery candidate includes complete section-by-section ADOPT / ADOPT WITH MODIFICATION / REJECT / DEFER provenance
    - architecture is independently reasoned against current IX Id contracts and invariants without premature implementation assumptions
    - complete diff and read-only validation pass; quarantined source and every unrelated path remain unchanged
    - independent POST-WORK contract/security/scope review evaluates every required topic and returns GO before staging or commit
    - separate explicit human approval is received before staging or committing the reviewed recovery candidate

stop_conditions:
  - quarantined residue SHA-256 mismatch
  - ambiguous or incomplete quarantine identity
  - repository authority or authoritative baseline drift
  - CURRENT-LANE.md committed, index, or worktree identity mismatch
  - outside-manifest drift not expressly permitted by the phase-specific comparison rule
  - recovery destination exists before the authorized recovery operation begins
  - recovery requires modifying, normalizing, moving, staging, committing, replacing, or deleting the quarantined source
  - recovery requires another M2 contract amendment
  - recovery identifies a new M2 implementation defect whose correction is prerequisite to the proposed M3 contract
  - a proposed contract requirement cannot be separated from M3 implementation work
  - an implementation or deployment dependency must be exercised to validate the contract
  - a required authoritative reference falls outside allowed_paths
  - any frozen invariant conflict
  - independent reviewer cannot establish required evidence or returns anything other than GO
  - provenance between source material and adopted contract semantics is ambiguous or incomplete
  - any M2 completion gate is waived, weakened, bypassed, satisfied by implication, altered, or deemed complete
  - any M3 implementation, deployment, provider, Firebase, GCP, Cloud Armor, DNS, production, network, blockchain, or external-state operation is proposed or performed
  - I-6 baseline or commit guard fails (BLOCKED — LANE MUTEX VIOLATED)
  - staged or committed transition path set contains anything other than docs/agent-governance/CURRENT-LANE.md
  - any attempt to amend, rebase, squash, or rewrite an existing commit

last_human_review: "2026-08-25"
  # Metadata only. Not freshness proof or authorization.
