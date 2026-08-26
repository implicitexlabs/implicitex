# CURRENT-LANE.md — M3 D-1 asset-binding contract hardening
# =========================================================
# Human-authorized governance transition. Replaces the satisfied
# m3-payment-route-contract-recovery lane. Authority derives from the committed
# M2 contract-design exception, the exact reviewed M3 recovery contract at
# addd4cf, and explicit human authorization in a human-controlled primary
# session on 2026-08-25.

lane_id: m3-payment-route-contract-hardening-d1
status: ACTIVE

objective: >
  Authorize a later, separately instructed contract-hardening operation to
  resolve only D-1 in docs/architecture/ixid-payment-route-v0.1-recovery.md:
  establish the exact Circle-issued native-USDC contract address on Polygon PoS
  mainnet, establish auditable issuer-primary and corroborative source
  provenance, define immutable asset_binding_version semantics, define
  fail-closed successor-binding behavior, and amend only that committed M3
  contract as needed. This is contract design only. M2 remains OPEN/BLOCKED and
  no M3 implementation is authorized. This transition installs the lane only;
  it does not commence D-1 research or contract amendment.

transition_authority:
  mechanism: >
    Explicit human authorization in a human-controlled primary session on
    2026-08-25, specifically authorizing this one CAS-governed transition from
    the satisfied recovery lane. Product-sequence authority remains §15.1 of
    docs/architecture/ixid-onboarding-v0.1.md. D-1 authority is bounded by the
    committed recovery contract and this lane; it does not derive from the
    quarantined original.
  prior_lane_id: m3-payment-route-contract-recovery
  prior_lane_blob: ba8901863aa312fb7eb81aa657250b2acbdedc0f
  prior_lane_satisfaction_commit: addd4cf4779a8a755cead60d6a8e1850d2bf8f21
  expected_transition_parent: addd4cf4779a8a755cead60d6a8e1850d2bf8f21
  prior_lane_status: >
    SATISFIED — its governed recovery candidate received independent PRE-WORK
    and POST-WORK GO, was committed as the sole changed path in
    addd4cf4779a8a755cead60d6a8e1850d2bf8f21, and was subsequently reconciled
    read-only as the exact reviewed artifact with SHA-256
    4ee19ce893978b61baef53973ce0ab46d63938f50cdb005f377b3144d8323ec3.

authoritative_baseline_commit: addd4cf4779a8a755cead60d6a8e1850d2bf8f21

m2_state:
  status: OPEN / BLOCKED
  authority: docs/architecture/ixid-onboarding-v0.1.md §15.1
  contract_sha256: 658d3b928e16f99a04a1de5b815084f66fef70a72599ed42442313b7cd3207fa
  statement: >
    M2 remains formally OPEN/BLOCKED. Every existing M2 completion gate,
    production-activation requirement, operational requirement, acceptance
    requirement, and human-observed smoke-test requirement remains in force.
    None is waived, weakened, bypassed, satisfied by implication, reclassified,
    or deemed complete by this lane or work under it.

m3_state:
  status: D-1 CONTRACT HARDENING ONLY — IMPLEMENTATION NOT BEGUN
  authority: docs/architecture/ixid-payment-route-v0.1-recovery.md
  contract_blob: 65b732a687dc31dd1b721dd4a34fd5b341901b56
  contract_sha256: 4ee19ce893978b61baef53973ce0ab46d63938f50cdb005f377b3144d8323ec3
  statement: >
    Separately governed D-1 contract hardening is permitted while M2 remains
    OPEN/BLOCKED. It does not constitute commencement, partial commencement, or
    implicit authorization of M3 implementation. Formal M3 implementation
    remains unavailable until M2 satisfies every existing closure requirement
    and later implementation authority is explicitly established. D-5, M4, and
    M6 remain deferred and outside this lane.

d1_scope:
  target: docs/architecture/ixid-payment-route-v0.1-recovery.md
  questions:
    - establish the exact contract address of Circle-issued native USDC on Polygon PoS mainnet
    - establish authoritative source and provenance requirements for that binding
    - define immutable asset_binding_version semantics
    - define fail-closed replacement and successor-version behavior if the authoritative asset binding is superseded or changed
    - amend only the committed M3 recovery contract as needed to encode the independently reviewed D-1 result
  contract_boundary: >
    The future operation may establish canonical Polygon PoS network binding,
    exact native-USDC token-contract identity, the relationship between token
    identity and an immutable asset_binding_version, provenance required to
    create a binding version, successor-version rules, fail-closed treatment of
    stale, unknown, mismatched, or unsupported versions, prohibition on silent
    reinterpretation, and confusion resistance for symbol aliases, USDC.e,
    bridged, or superseded assets. Observable contract semantics belong in the
    recovered contract. This governance file does not prescribe a physical or
    implementation-specific representation.

public_source_policy:
  research_status: PROHIBITED UNTIL EXPLICIT EXECUTION-HOLD RELEASE
  primary_authority: >
    Official Circle-controlled documentation or publication identifying native
    USDC contract addresses and supported blockchain deployments. Circle is the
    primary factual authority for token identity.
  corroborative_evidence: >
    Official Polygon documentation and reputable public Polygon block-explorer
    contract evidence may corroborate the Circle-established identity only.
    Corroboration does not replace Circle as issuer authority.
  required_provenance:
    - issuer or source organization
    - exact source document or page
    - source locator
    - retrieval date
    - asserted network
    - asserted token contract address
    - corroborative source
    - agreement or discrepancy between primary and corroborative sources
    - rationale for treating the evidence as authoritative
  disagreement_rule: >
    Any material disagreement between Circle-primary and corroborative evidence
    is STOP BLOCKED. No source may be guessed, silently preferred, or substituted.
  rpc_authority: PROHIBITED
  rpc_statement: >
    eth_call, eth_getCode, eth_getStorageAt, provider-specific RPC, wallet-provider
    queries, live-node inspection, authenticated infrastructure inspection,
    runtime discovery, and mutable provider responses cannot establish the
    canonical D-1 asset identity. Separately governed future implementation
    validation does not convert runtime results into contract authority.

execution_hold:
  status: ACTIVE
  applies_to:
    - public-source D-1 research
    - external web or source retrieval for D-1
    - editing docs/architecture/ixid-payment-route-v0.1-recovery.md
    - staging docs/architecture/ixid-payment-route-v0.1-recovery.md
    - committing docs/architecture/ixid-payment-route-v0.1-recovery.md
  release_condition: >
    A subsequent explicit human instruction in a human-controlled primary
    session must identify lane m3-payment-route-contract-hardening-d1, target
    docs/architecture/ixid-payment-route-v0.1-recovery.md, the exact D-1 scope,
    authority to perform public-source research, the Circle-primary and
    corroborative-chain-evidence policy, and authorization through independent
    POST-WORK review. When all elements are present and fresh repository/lane
    authority plus independent PRE-WORK review pass, that instruction is
    sufficient to release this hold for the named research/design operation; no
    CURRENT-LANE.md transition is required solely to recognize the release.
    Staging or committing the D-1 amendment still requires separate explicit
    human approval after POST-WORK GO.
  transition_boundary: >
    The instruction installing this lane does not release the hold. No D-1
    research, public-source access, recovery-contract edit, product staging, or
    product commit may occur during this transition.

quarantine:
  path: docs/architecture/ixid-payment-route-v0.1.md
  classification: PRESERVED UNAUTHORIZED RESIDUE / ZERO AUTHORITY
  recorded_sha256: 02ccc1e5c1e5a16072378b90df7c3b7090dbf06b37f561d0b7712bf94cba9f9e
  statement: >
    The quarantined original is historical evidence only and is not D-1 design
    input. Its contents and propositions must not be read or used during this
    transition or future D-1 work. It must not be edited, normalized, moved,
    renamed, deleted, restored, staged, committed, or treated as authority. Use
    only existing authorized quarantine metadata for manifest verification. A
    direct read-only integrity hash is permitted only if then-current doctrine
    and explicit human authority require it for a future boundary check; hashing
    never authorizes content access or architectural use.

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
  - docs/architecture/ixid-payment-route-v0.1-recovery.md
  - docs/architecture/ixid-payment-route-v0.1.md

allowed_operations:
  - read-only inspection of repository metadata and committed governance and IX Id references listed in allowed_paths
  - write: docs/agent-governance/CURRENT-LANE.md (this transition only, solely to install this independently reviewed lane)
  - stage: docs/agent-governance/CURRENT-LANE.md (this transition only)
  - create one non-amend transition commit whose changed-path set is exactly docs/agent-governance/CURRENT-LANE.md
  - run read-only governance, integrity, and contract validation relevant to this transition
  - use existing quarantine metadata and status identity without reading quarantined source contents
  - AFTER explicit execution-hold release and independent PRE-WORK GO only — perform read-only public-source D-1 research under public_source_policy
  - AFTER explicit execution-hold release and PRE-WORK GO only — edit docs/architecture/ixid-payment-route-v0.1-recovery.md solely to resolve d1_scope
  - AFTER explicit execution-hold release only — perform contract analysis, read-only validation, and independent contract/security/scope POST-WORK review
  - AFTER independent POST-WORK GO and separate explicit human commit approval only — stage and commit exactly docs/architecture/ixid-payment-route-v0.1-recovery.md

d5_exclusion:
  status: OUT OF SCOPE
  prohibited_topics:
    - physical Firestore collection or document paths
    - indexes
    - migrations
    - backfills
    - absent-versus-null persistence behavior
    - database schema implementation
    - storage topology
    - implementation migration planning

independent_review_requirements:
  timing: BEFORE ANY STAGING OR COMMIT OF A D-1 AMENDMENT
  mode: independent POST-WORK contract / security / scope review
  required_topics:
    - source provenance
    - exact Polygon network identity
    - exact native-USDC contract identity
    - Circle-primary evidence
    - corroborative evidence
    - source disagreement handling
    - immutable asset_binding_version semantics
    - successor-binding semantics
    - stale, unknown, and mismatched-version handling
    - native-USDC versus USDC.e confusion resistance
    - fail-closed behavior
    - impact on resolver and payability semantics
    - preservation of M2 and M3 implementation boundaries
    - absence of D-5 or implementation leakage
  evidence: >
    The reviewer must receive fresh repository and lane authority, the exact
    pre-work manifest, mechanically derived task-attributable change, complete
    contract diff, primary and corroborative source provenance, candidate hash,
    unchanged M2 and quarantine evidence, and absence-of-RPC,
    implementation, deployment, and external-mutation evidence.

explicitly_out_of_scope:
  - D-1 research before explicit execution-hold release
  - public web or source retrieval before explicit execution-hold release
  - modification of docs/agent-governance/CURRENT-LANE.md after this lane-transition commit
  - reading or using propositions from docs/architecture/ixid-payment-route-v0.1.md
  - modifying, normalizing, moving, renaming, deleting, restoring, staging, or committing docs/architecture/ixid-payment-route-v0.1.md
  - use of the quarantined original as architectural authority
  - D-5 work of any kind
  - M3 implementation of any kind
  - API implementation
  - persistence or database implementation
  - Firestore implementation
  - backend implementation
  - frontend implementation
  - resolver implementation
  - wallet integration
  - signing or KMS changes
  - payment execution
  - transaction creation or submission
  - RPC-based authority discovery
  - Firebase mutation
  - GCP mutation
  - Cloud Armor mutation
  - DNS mutation
  - provider mutation
  - production configuration
  - deployment
  - network mutation
  - blockchain mutation
  - any external-state mutation
  - M4 work
  - M6 work
  - declaration that M2 is complete
  - waiver, weakening, bypass, inference of completion, reclassification, or alteration of any M2 closure requirement
  - modification of any allowed read-only reference other than the single future D-1 target
  - a second D-1 product-contract artifact
  - unrelated product, architecture, roadmap, cleanup, or governance work
  - alteration, cleanup, deletion, restoration, staging, or incorporation of pre-existing dirty or untracked paths
  - amending, rebasing, squashing, or rewriting any existing commit

pre_existing_outside_manifest:
  classification: PRE-EXISTING / PROVENANCE-ONLY / ZERO AUTHORITY
  status_sha256: 59d9f154afedff2f56b3c94c7e4a5cfb00addba72493e489da61da3470f2a2d5
  modified_tracked_count: 10
  untracked_count: 56
  provenance: >
    Exact complete porcelain-v1 manifest identity carried from the satisfied
    recovery lane and freshly revalidated at addd4cf before this transition. It
    includes the quarantined source's status entry but no file content. The
    committed recovery contract is clean and therefore absent from this status
    manifest.
  transition_comparison_rule: >
    PRE-TRANSITION and POST-TRANSITION compare the complete path/status set
    exactly, mechanically excluding only docs/agent-governance/CURRENT-LANE.md.
    Matching counts without matching the complete manifest digest is
    insufficient.
  d1_comparison_rule: >
    Future D-1 PRE-WORK must begin from this exact complete manifest with the D-1
    target clean. At POST-WORK, compare the complete path/status set
    mechanically excluding only docs/architecture/ixid-payment-route-v0.1-recovery.md.
    Every other path and status, including the quarantine status entry, must
    remain identical.

acceptance_gates:
  transition_phase:
    - exact transmission terminator IXID-M3-D1-LANE-09 received before any repository write
    - fresh authority confirms HEAD addd4cf4779a8a755cead60d6a8e1850d2bf8f21 and committed prior lane blob ba8901863aa312fb7eb81aa657250b2acbdedc0f with matching HEAD, index, and worktree identity
    - prior recovery lane satisfaction is independently established from POST-WORK GO, sole-path commit addd4cf4779a8a755cead60d6a8e1850d2bf8f21, and exact post-commit reconciliation
    - committed docs/architecture/ixid-payment-route-v0.1-recovery.md has blob 65b732a687dc31dd1b721dd4a34fd5b341901b56 and SHA-256 4ee19ce893978b61baef53973ce0ab46d63938f50cdb005f377b3144d8323ec3
    - committed docs/architecture/ixid-onboarding-v0.1.md has SHA-256 658d3b928e16f99a04a1de5b815084f66fef70a72599ed42442313b7cd3207fa and preserves M2 OPEN/BLOCKED, all M2 closure gates, the separately governed contract-design exception, and the M3 implementation prohibition
    - complete outside manifest matches 10 modified tracked plus 56 untracked and SHA-256 59d9f154afedff2f56b3c94c7e4a5cfb00addba72493e489da61da3470f2a2d5
    - independent PRE-TRANSITION scope-sentinel review of the complete candidate returns GO before the first CURRENT-LANE.md write
    - I-6 baseline guard passes immediately before the first write using freshly recorded expected HEAD addd4cf4779a8a755cead60d6a8e1850d2bf8f21 and committed lane blob ba8901863aa312fb7eb81aa657250b2acbdedc0f
    - I-6 commit guard passes immediately before staging; expected pair remains unchanged, worktree lane hash equals the reviewed candidate hash, and index state is expected
    - staged changed-path set is exactly docs/agent-governance/CURRENT-LANE.md
    - one non-amend transition commit with message "chore(governance): open M3 D1 asset-binding hardening lane"
    - POST-TRANSITION verification confirms parent, sole committed path, committed reviewed lane blob, clean index, and unchanged M3 and M2 contracts
    - outside manifest remains exact under transition_comparison_rule
    - no D-1 research, public-source retrieval, RPC/provider query, quarantine interaction, D-5 work, implementation, deployment, or external-state mutation occurs
  d1_phase:
    - a subsequent explicit human instruction satisfying execution_hold.release_condition is received and fresh repository/lane authority passes before D-1 research or contract editing
    - independent PRE-WORK scope review returns GO on the exact research/design plan and complete pre-work manifest
    - Circle-controlled evidence establishes one unambiguous native-USDC contract identity on Polygon PoS mainnet
    - independent corroborative Polygon or public explorer evidence agrees materially with Circle-primary evidence
    - required source provenance is recorded and independently auditable
    - only docs/architecture/ixid-payment-route-v0.1-recovery.md is modified and only for D-1
    - resulting contract defines immutable binding-version identity, successor-version semantics, and fail-closed unknown, stale, unsupported, or mismatched behavior without D-5 or implementation leakage
    - complete diff and read-only validation pass; M2, quarantine, governance, and every unrelated path remain unchanged
    - independent POST-WORK contract/security/scope review evaluates every required topic and returns GO before staging or commit
    - separate explicit human approval is received before staging or committing the reviewed D-1 amendment

stop_conditions:
  - repository or lane authority drift
  - CURRENT-LANE.md committed, index, or worktree identity mismatch
  - recovery-contract identity changes unexpectedly
  - M2 identity or authority changes incompatibly
  - outside-manifest drift not expressly permitted by the phase-specific comparison rule
  - Circle primary authority cannot establish one unambiguous Polygon native-USDC identity
  - Circle and corroborative evidence materially disagree
  - exact token contract address remains ambiguous
  - source is unofficial or cannot establish adequate provenance
  - D-1 resolution requires RPC, runtime discovery, provider response, or live-infrastructure inspection as authority
  - proposed asset_binding_version can change meaning in place
  - replacement or successor semantics permit silent reinterpretation
  - unsupported, unknown, stale, or mismatched binding versions do not fail closed
  - resolving D-1 requires D-5 persistence or migration design
  - resolving D-1 requires M3 implementation
  - resolving D-1 requires M4 or M6 design
  - resolving D-1 requires another M2 contract amendment
  - required authoritative repository reference falls outside allowed_paths
  - external-state mutation becomes necessary
  - quarantined original content is read or used, or its bytes/path/status are changed
  - independent reviewer cannot establish required evidence, identifies a security or contract ambiguity, or returns anything other than GO
  - any frozen invariant conflicts with the transition or proposed D-1 design
  - any M2 completion gate is waived, weakened, bypassed, satisfied by implication, reclassified, altered, or deemed complete
  - any D-5, M3 implementation, M4, M6, deployment, provider, Firebase, GCP, Cloud Armor, DNS, production, network, blockchain, or external-state operation is proposed or performed
  - I-6 baseline or commit guard fails (BLOCKED — LANE MUTEX VIOLATED)
  - staged or committed transition path set contains anything other than docs/agent-governance/CURRENT-LANE.md
  - any attempt to amend, rebase, squash, or rewrite an existing commit

last_human_review: "2026-08-25"
  # Metadata only. Not freshness proof or authorization.
