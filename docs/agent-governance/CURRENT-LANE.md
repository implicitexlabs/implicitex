# CURRENT-LANE.md — Authoritative POST-WORK recovery/review boundary
# ==================================================================
# This file grants permission to review and close only the interrupted Slice F
# implementation described below. It grants no authority to make a new product
# implementation edit.
#
# If this file is missing, malformed, internally contradictory, or does not
# authorize the requested work, scope-sentinel must return BLOCKED. No
# best-effort interpretation is permitted.
#
# STALENESS POLICY
# ────────────────
# last_human_review is metadata, not a TTL and not evidence of freshness.
# There is no calendar-based expiration. Staleness is event-driven.
# This lane is stale if:
#
#   - status is not ACTIVE
#   - authoritative_baseline_commit is unavailable or no longer belongs to the
#     ancestry of the work being evaluated
#   - any doctrine path declared under doctrine_freshness fails mechanical
#     comparison with its tracked blob at authoritative_baseline_commit
#   - lane-transition authority cannot be established mechanically under
#     lane_authorization
#   - the carried Slice F diff cannot be attributed under recovery_provenance
#   - any declared stop_condition has been satisfied
#   - all acceptance_gates required for lane completion have been satisfied
#     while status still claims ACTIVE
#   - a human-authorized lane transition has superseded this lane
#
# If freshness or lane-transition authority cannot be established from
# mechanical repository evidence, or recovery provenance cannot be established
# from the mechanical repository evidence plus the explicitly authorized
# session-local recovery evidence declared under recovery_provenance:
#   BLOCKER — RECOVERY AUTHORITY OR PROVENANCE AMBIGUOUS
#
# Never use last_human_review as freshness proof.
#
# RECOVERY INTERPRETATION
# ───────────────────────
# This is a POST-WORK recovery/review lane, not a new implementation lane.
# allowed_paths identifies the exact three existing dirty Slice F files whose
# already-created contents and diff may be read, tested, reviewed, staged after
# POST-WORK GO, and committed after explicit human approval. It grants no
# authority to edit, replace, regenerate, format, or otherwise change their
# existing content.
#
# read_only_dependency_paths is a separate exact seven-file content-read
# boundary available only after every entry gate passes and only if required
# by the authorized direct test. It grants no create, modify, delete, rename,
# stage, or commit authority.
#
# The original immutable pre-work manifest and original independent PRE-WORK
# GO may be reused solely as session-local provenance evidence for the
# interrupted implementation anchored at
# f6ed76dcac52ab400faa82ffc5df692162dea090. They grant no authority for new
# implementation work.
#
# Existing dirty-worktree entries outside allowed_paths remain PRE-EXISTING
# provenance context. Their contents may not be opened. They may not be
# changed, staged, cleaned, restored, deleted, concealed, or attributed to
# Slice F. Provenance and scope classification remain separate dimensions.
# Outside manifest entries remain provenance/status evidence only unless
# independently discovered to be relevant to the task.

lane_id: m2-slice-f-post-work-recovery-review
status: ACTIVE

objective: >
  Preserve exactly the existing three-file Slice F implementation diff,
  mechanically attribute it to the interrupted implementation against
  f6ed76dcac52ab400faa82ffc5df692162dea090, rerun only the direct authorized
  nonnetworked frontend contract test, perform exact-path whitespace and
  integrity checks, capture and compare a fresh optional-lock-free POST-WORK
  manifest, and obtain a fresh independent POST-WORK scope-sentinel verdict.
  After POST-WORK GO, stage only the exact reviewed Slice F paths, verify the
  complete staged path set, blobs, diff, and cached whitespace check, and stop
  for explicit human commit approval. After that approval only, create one
  local non-merge Slice F implementation commit containing exactly the
  reviewed task paths and having the dedicated recovery-lane transition commit
  as its first parent. Make no new implementation edit, open no new repository
  content path, mutate no dependency or unrelated path, and perform no
  deployment, networked integration, Firebase mutation, GCP mutation, or other
  external-state mutation.

entry_condition: >
  A human-controlled session explicitly authorized this recovery lane,
  applied this exact human-approved CURRENT-LANE.md replacement, and committed
  it as the unique dedicated one-file governance recovery-lane transition
  required by lane_authorization. Commit
  f6ed76dcac52ab400faa82ffc5df692162dea090 is available locally and is the
  direct first parent of the derived recovery-lane transition commit. Current
  HEAD is exactly that derived transition commit. The transition commit,
  index, and worktree contain the same exact human-approved CURRENT-LANE.md
  blob, and no later commit changes CURRENT-LANE.md. The index is empty after
  the transition commit. Every doctrine-freshness comparison passes. Before
  any product or dependency content is opened, the session verifies from Git
  metadata that every allowed path and every read-only dependency path is an
  existing tracked regular file; mechanically verifies the original immutable
  pre-work manifest against its declared digest; verifies the availability and
  exact declared facts of the explicitly authorized original PRE-WORK GO
  session evidence under recovery_provenance; captures the fresh
  optional-lock-free POST-WORK manifest; proves the exact manifest relationship
  required by recovery_provenance; and captures immutable identities for the
  carried three-file diff and resulting worktree blobs. Any missing, unknown,
  ambiguous, or failed check is BLOCKER.

lane_authorization:
  mechanism: >
    Derive the recovery authorization commit mechanically; do not embed a
    self-referential transition-commit SHA in this file.
  derivation: >
    Examine commits reachable from current HEAD after
    f6ed76dcac52ab400faa82ffc5df692162dea090 that change
    docs/agent-governance/CURRENT-LANE.md. Exactly one such commit must exist.
    That commit is the derived recovery-lane transition commit.
  required_commit_properties:
    - it is a non-merge commit whose first parent is exactly f6ed76dcac52ab400faa82ffc5df692162dea090
    - its first-parent changed-path set is exactly docs/agent-governance/CURRENT-LANE.md
    - its tracked CURRENT-LANE.md blob is the exact human-approved replacement represented by this file
    - every tracked path other than docs/agent-governance/CURRENT-LANE.md has the same tree entry as at f6ed76dcac52ab400faa82ffc5df692162dea090
    - it is current HEAD when recovery work begins
    - no later commit through current HEAD changes docs/agent-governance/CURRENT-LANE.md
    - current HEAD, the index, and the worktree contain the transition commit's exact CURRENT-LANE.md blob
  recovery_head_rule: >
    Record the derived recovery-lane transition commit as recovery_head.
    Require HEAD to remain exactly recovery_head through POST-WORK review,
    testing, staging review, and explicit human commit approval. The only
    permitted later HEAD change is creation of the explicitly approved local
    implementation commit whose first parent is recovery_head.
  failure_rule: >
    If the recovery transition is absent, non-unique, not dedicated, not a
    direct child of f6ed76dcac52ab400faa82ffc5df692162dea090, superseded,
    different from this approved lane blob, not current HEAD, or differs at
    HEAD, index, or worktree, return BLOCKER — LANE AUTHORITY AMBIGUOUS. Do not
    open product or dependency content, run tests, stage, or commit.

known_external_governance_event:
  event_type: >
    KNOWN EXTERNAL GOVERNANCE EVENT. This records provenance; it grants no
    product scope, doctrine authority, or permission to tolerate future drift.
  event: >
    During the interrupted authorized Slice F implementation, unauthorized
    concurrent worktree and index drift appeared at
    docs/agent-governance/CURRENT-LANE.md. Implementation stopped without
    staging or committing the product diff.
  human_recovery_evidence:
    restored_head: f6ed76dcac52ab400faa82ffc5df692162dea090
    restored_current_lane_git_blob: 4218b378c36c59a3dcd862a12d5c8d95d3e46c52
    restored_current_lane_sha256: 3d67a7546ce7b3fabd50e5cdff27806136dda52382102c994d7d3b43a8249a8e
    stability_observations: 5
    stability_interval: 40 seconds
    inotify_watch: 45 seconds with no writes
    active_agent_or_editor_holder_found: false
    restored_index_state: empty
  interpretation: >
    Before this human-authorized recovery transition was applied, the human
    restored both index and worktree CURRENT-LANE.md to the exact tracked
    f6ed76dcac52ab400faa82ffc5df692162dea090 blob and established the recorded
    stability evidence. The dedicated recovery transition deliberately
    replaces that restored blob. Unauthorized drift content, including any
    purported or ratified reconnaissance-lane content, carries zero authority
    and may not be reused, staged, or committed.
  recurrence_rule: >
    The restoration evidence describes only the completed past recovery
    checkpoint. It does not authorize ignoring, repairing, or working through
    any later drift. Any unapproved recurrence of CURRENT-LANE.md worktree,
    index, blob, or history drift is BLOCKER — CONCURRENT DOCTRINE CHANGE.
    Stop immediately without restoring or otherwise mutating the path.

recovery_provenance:
  authoritative_product_baseline: f6ed76dcac52ab400faa82ffc5df692162dea090
  original_pre_work_head: f6ed76dcac52ab400faa82ffc5df692162dea090
  original_pre_work_manifest_sha256: 112a881461d2d31d566589f17b2a068b33f4a12fdc8aab710199b0ccd4556d9a
  original_pre_work_facts:
    - the original immutable manifest was captured with Git optional locks disabled
    - all three allowed_paths were clean
    - all seven read_only_dependency_paths were clean
    - the index was empty
    - the explicitly authorized original independent PRE-WORK scope-sentinel verdict was GO
  reuse_limit: >
    The exact original recorded immutable manifest and the explicitly
    authorized original PRE-WORK GO session evidence may be supplied and reused
    only to establish provenance for the already interrupted Slice F
    implementation. Mechanically verify the exact manifest bytes against the
    declared SHA-256. Separately verify the availability and exact declared
    facts of the PRE-WORK GO session evidence. Do not imply that the historical
    sentinel verdict is mechanically derivable from Git, and do not reinterpret
    either artifact as authority to begin or alter implementation.
  fresh_post_work_manifest_rule: >
    After lane authority and doctrine freshness pass, capture verbatim a fresh
    complete git status --short --untracked-files=all manifest with Git
    optional locks disabled and before product or dependency content is
    opened, tests run, or staging occurs. The index must be empty. Relative to
    the exact original immutable manifest, the only permitted worktree-status
    additions or changes are unstaged modifications of all three and only the
    three exact allowed_paths. Every outside path-and-status entry must match
    the original manifest exactly. No read_only_dependency_path or doctrine
    path may appear. The dedicated recovery-lane transition is accounted for
    only as the exact committed one-file history transition under
    lane_authorization and must not appear as index or worktree drift.
  carried_diff_rule: >
    Mechanically derive the complete existing task-attributable diff for all
    three and only the three allowed_paths against
    f6ed76dcac52ab400faa82ffc5df692162dea090. Before opening product content,
    record an immutable digest of that complete diff and the canonicalized
    worktree blob identity for each allowed path without changing any file or
    writing a Git object. Require the same complete diff and blob identities
    through testing, POST-WORK review, staging verification, and human commit
    approval. The transition commit changes no product tree entry, so the
    product diff against recovery_head must be identical to the product diff
    against the authoritative product baseline.
  failure_rule: >
    If the original manifest cannot be mechanically verified against its
    declared digest; if the explicitly authorized original PRE-WORK GO session
    evidence is unavailable or inconsistent with its exact declared facts; if
    either artifact is used for any purpose beyond interrupted-work
    provenance; if the fresh manifest comparison is not exact; if task
    attribution is not exactly the three allowed paths; or if any carried diff
    or blob identity changes, return BLOCKER — RECOVERY PROVENANCE AMBIGUOUS.
    Do not edit, stage, or commit.

doctrine_freshness:
  reference_commit: f6ed76dcac52ab400faa82ffc5df692162dea090
  paths:
    - AGENTS.md
    - CLAUDE.md
    - .claude/agents/scope-sentinel.md
    - docs/agent-governance/CHARTER.md
    - docs/agent-governance/FROZEN-INVARIANTS.md
  comparison_rule: >
    For every declared path, mechanically obtain the tracked blob object ID
    at reference_commit and require the current HEAD blob object ID and index
    blob object ID to equal it. Canonicalize the current worktree file through
    Git's normal path filters without writing an object and require the
    resulting blob object ID to equal the same reference blob object ID.
    Record the object IDs and PASS or FAIL before product or dependency
    content is opened, again for fresh POST-WORK scope review, and again for
    staged-integrity and pre-commit review. CURRENT-LANE.md is intentionally
    excluded because lane_authorization governs its exact human-authorized
    recovery transition and known_external_governance_event governs the
    restored earlier drift.
  failure_rule: >
    A missing path, unreadable object, object-ID mismatch, unmerged index
    entry, inability to canonicalize worktree content, unknown result, or
    later mismatch is BLOCKER — DOCTRINE FRESHNESS NOT ESTABLISHED. Do not
    open product or dependency content, run tests, stage, or commit.

allowed_paths:
  - ixid-onboarding-web/public/action.js
  - ixid-onboarding-web/public/action.html
  - ixid-onboarding-web/tests/frontend-contract.test.js

read_only_dependency_paths:
  - ixid-onboarding-web/public/config.js
  - ixid-onboarding-web/public/firebase-auth-adapter.js
  - ixid-onboarding-web/public/index.html
  - ixid-onboarding-web/public/register.css
  - ixid-onboarding-web/public/register.js
  - ixid-onboarding-web/public/onboarding-core.js
  - ixid-onboarding-web/public/holder-api-client.js

allowed_read_boundaries:
  - current doctrine content limited to AGENTS.md, CLAUDE.md, .claude/agents/scope-sentinel.md, docs/agent-governance/CHARTER.md, docs/agent-governance/CURRENT-LANE.md, and docs/agent-governance/FROZEN-INVARIANTS.md
  - the exact original immutable pre-work manifest and explicitly authorized original PRE-WORK scope-sentinel GO supplied as session-local recovery-provenance evidence
  - current working-tree content and complete baseline/worktree diff of the exact paths in allowed_paths after every entry, authority, doctrine-freshness, manifest, and carried-diff identity gate passes
  - current working-tree content of the exact paths in read_only_dependency_paths after every entry gate passes, solely if required by the authorized direct local test
  - commit, tree, ref, ancestry, blob-object-identity, canonicalized-worktree-identity, index-entry, changed-path, name-status, worktree-status, diff, and digest metadata required for lane authority, doctrine freshness, provenance, review, staging, and commit-integrity checks
  - complete original and fresh worktree manifests as path-and-status metadata only; an outside manifest entry grants no authority to open its content or infer its scope
  - unstaged, combined, and staged diffs and blobs limited to the exact task-attributable changes in allowed_paths
  - output from the exact authorized direct local test, provided it contains no prohibited sensitive value or raw Firebase error
  - session-local reasoning, scope-sentinel review, and reporting over authorized evidence

prohibited_paths:
  - every product, implementation, test, configuration, documentation, operations, architecture, infrastructure, service, contract, or application path not listed in allowed_paths or read_only_dependency_paths
  - contents of untracked, ignored, or outside dirty-worktree files
  - direct filesystem reads of .git/**
  - credential, secret, service-account, private-key, token, and .env paths
  - ixid-onboarding-web/public/config.js for every create, modify, delete, rename, stage, or commit operation
  - ixid-onboarding-web/public/firebase-auth-adapter.js for every create, modify, delete, rename, stage, or commit operation
  - ixid-onboarding-web/public/index.html for every create, modify, delete, rename, stage, or commit operation
  - ixid-onboarding-web/public/register.css for every create, modify, delete, rename, stage, or commit operation
  - ixid-onboarding-web/public/register.js for every create, modify, delete, rename, stage, or commit operation
  - ixid-onboarding-web/public/onboarding-core.js for every create, modify, delete, rename, stage, or commit operation
  - ixid-onboarding-web/public/holder-api-client.js for every create, modify, delete, rename, stage, or commit operation
  - AGENTS.md for every create, modify, delete, rename, stage, or commit operation
  - CLAUDE.md for every create, modify, delete, rename, stage, or commit operation
  - .claude/agents/** for every create, modify, delete, rename, stage, or commit operation
  - docs/agent-governance/CHARTER.md for every create, modify, delete, rename, stage, or commit operation
  - docs/agent-governance/CURRENT-LANE.md for every change other than the exact human-applied dedicated recovery-lane transition governed by lane_authorization
  - docs/agent-governance/FROZEN-INVARIANTS.md for every create, modify, delete, rename, stage, or commit operation

allowed_operations:
  - read and parse the six doctrine files declared in allowed_read_boundaries
  - obtain current HEAD and verify baseline availability, direct parentage, and ancestry using non-mutating Git commands
  - derive and verify the dedicated one-file recovery-lane transition commit under lane_authorization
  - mechanically compare doctrine blob identities under doctrine_freshness without writing Git objects
  - verify from Git metadata that every allowed path and every read-only dependency path is an existing tracked regular file
  - mechanically verify the original immutable pre-work manifest against its declared digest and verify the availability and exact declared facts of the explicitly authorized original PRE-WORK GO session evidence, then reuse both solely under recovery_provenance
  - capture and preserve verbatim the fresh complete optional-lock-free POST-WORK manifest
  - compare the fresh POST-WORK manifest mechanically with the exact original immutable manifest under recovery_provenance
  - derive mechanically the exact three-file task-attributable carried diff against f6ed76dcac52ab400faa82ffc5df692162dea090
  - record and reverify immutable digests and canonicalized worktree blob identities for the exact carried diff without changing files or writing Git objects
  - recognize the existing modify operations on all three allowed_paths as carried IN-LANE implementation changes only when every recovery-provenance gate passes
  - read the existing dirty contents and diff of the exact three allowed_paths after every entry and recovery-provenance gate passes
  - read the exact seven read_only_dependency_paths after every entry gate passes, solely if required by the exact authorized direct test
  - run only node ixid-onboarding-web/tests/frontend-contract.test.js as the already-authorized direct nonnetworked frontend contract test, provided it installs nothing, writes no repository artifact, and content-reads no repository file outside allowed_paths and read_only_dependency_paths
  - inspect that direct test's output only for pass/fail diagnosis and redact or stop if prohibited sensitive data appears
  - run git diff --check scoped with explicit pathspecs to all three and only the three allowed_paths and require PASS
  - obtain a fresh independent POST-WORK scope-sentinel review before staging, supplying the exact requested task, original immutable pre-work manifest and digest, explicitly authorized original PRE-WORK GO session evidence, fresh POST-WORK manifest, mechanical manifest comparison, mechanically derived task-attributable path set, complete actual diff against f6ed76dcac52ab400faa82ffc5df692162dea090, carried-diff and blob identities, repository-authority evidence, doctrine-freshness evidence, direct-test result, whitespace-check result, known external governance event, and frozen invariants
  - after fresh independent POST-WORK GO, stage all three and only the three exact reviewed allowed_paths using explicit pathspecs
  - inspect the exact staged name-status, staged blob identities, complete staged diff, remaining unstaged diff, and complete index
  - run git diff --cached --check and require PASS
  - verify that staged blobs and complete staged diff exactly match the immutable carried worktree blobs and carried diff reviewed by the independent POST-WORK scope-sentinel
  - request explicit human approval to commit the exact reviewed staged diff
  - after explicit human approval, create one local non-merge Slice F implementation commit whose changed-path set is exactly allowed_paths and whose first parent is recovery_head
  - verify non-mutating implementation-commit metadata and a final optional-lock-free worktree manifest
  - classify every proposed change, carried change, and discovered dependency as exactly IN-LANE, BLOCKER, FOLLOW-ON, or UNRELATED
  - treat outside manifest entries as provenance/status evidence only unless independently discovered to be relevant to the task
  - if an outside manifest entry becomes an actual discovered dependency, classify it under the exclusive taxonomy and stop as BLOCKER because it is outside the authorized lane
  - propose a clearly labeled doctrine change if any further implementation or scope expansion is required, then stop without applying it

prohibited_operations:
  - any edit, replacement, formatting, regeneration, or other content change to an allowed path
  - any new Slice F implementation work before or after POST-WORK review
  - any attempt to repair a concrete defect found by testing or review under this recovery lane
  - any create, modify, delete, rename, stage, or commit operation on a read-only dependency path
  - reading any repository content path outside allowed_paths, read_only_dependency_paths, and the exact doctrine boundary
  - reuse, restoration, staging, commit, or ratification of unauthorized reconnaissance-lane or other concurrent-drift content
  - broad staging, staging before fresh independent POST-WORK GO, or staging any path not in allowed_paths
  - any doctrine change other than the exact human-applied dedicated recovery-lane transition
  - any unrelated cleanup, restoration, deletion, staging, reconciliation, or attribution
  - any network access, dependency installation, generated artifact, cache creation, migration, deployment, activation, publication, or external mutation

explicitly_out_of_scope:
  - new or corrective Slice F implementation edits
  - production Firebase action-adapter integration, classified FOLLOW-ON
  - live Firebase browser end-to-end testing
  - creation, modification, deletion, rename, staging, or commit of any path in read_only_dependency_paths
  - any repository dependency or content read outside the exact authorized doctrine, allowed_paths, and read_only_dependency_paths boundaries
  - unauthorized ratified reconnaissance-lane content or any artifact derived from it
  - Slice C remediation
  - Firebase provider activation or Firebase project mutation
  - deployment, release, publication, or environment activation
  - networked tests or calls to Firebase, GCP, or any other external service
  - GCP mutation of any kind
  - Cloud Armor, D0, or Slice D work
  - M3 planning, reconnaissance, implementation, or remediation
  - package installation, dependency updates, generators, migrations, or commands that create caches or repository artifacts
  - architecture redesign
  - changes to routes, adapters, assets, configuration, headers, build systems, test harnesses, documentation, or dependencies
  - broad product, architecture, operations, infrastructure, service, contract, or application inspection
  - opening the contents of outside dirty-worktree paths
  - altering or concealing pre-existing user changes
  - amending, rebasing, merging, tagging, pushing, fetching, changing refs other than creation of the explicitly approved local implementation commit, or rewriting history
  - automatic or agent-initiated doctrine mutation

acceptance_gates:
  - f6ed76dcac52ab400faa82ffc5df692162dea090 is available and is the direct first parent of the derived recovery-lane transition commit
  - lane-transition authority is established mechanically under lane_authorization, including uniqueness, exact direct parentage, non-merge status, exact one-file changed-path set, exact approved CURRENT-LANE.md blob, and current-HEAD checks
  - current HEAD is recorded as recovery_head and remains unchanged through POST-WORK review, testing, staging review, and explicit human commit approval
  - every doctrine_freshness path has matching reference, HEAD, index, and canonicalized worktree blob identities at every required review point
  - the known interrupted CURRENT-LANE.md drift is treated only as a restored external governance event and no unauthorized drift content is reused, staged, committed, or treated as authority
  - no CURRENT-LANE.md or other doctrine drift recurs after the dedicated recovery transition
  - the exact original immutable pre-work manifest is available verbatim and mechanically hashes to 112a881461d2d31d566589f17b2a068b33f4a12fdc8aab710199b0ccd4556d9a
  - the explicitly authorized original independent PRE-WORK GO session evidence is available, its exact declared facts match the interrupted implementation anchored at f6ed76dcac52ab400faa82ffc5df692162dea090, and it is reused solely as provenance evidence
  - every allowed path and all seven read-only dependency paths are mechanically confirmed to be existing tracked regular files
  - a fresh complete optional-lock-free POST-WORK manifest is captured before product or dependency content is opened, tests run, or staging occurs
  - the fresh POST-WORK manifest has an empty index and differs from the exact original manifest only by unstaged modifications of all three and only the three exact allowed_paths
  - every outside manifest path-and-status entry matches the original immutable manifest exactly after accounting only for the committed dedicated recovery-lane transition and the exact three product modifications
  - outside manifest entries remain provenance/status evidence only unless independently discovered to be relevant to the task
  - all seven read_only_dependency_paths remain clean and mechanically unchanged from f6ed76dcac52ab400faa82ffc5df692162dea090
  - the recovery transition commit preserves the f6ed76dcac52ab400faa82ffc5df692162dea090 tree entry for every product and dependency path
  - the task-attributable path set is derived mechanically as all three and only the three allowed_paths, each with an existing modify operation
  - the complete carried product diff is derived mechanically against f6ed76dcac52ab400faa82ffc5df692162dea090 and is identical against recovery_head
  - the complete carried-diff digest and each canonicalized worktree blob identity are recorded before content review and remain unchanged through testing, POST-WORK review, staging verification, and human commit approval
  - no new implementation edit or other product-content mutation occurs
  - node ixid-onboarding-web/tests/frontend-contract.test.js passes all 20 tests without network access, external mutation, dependency installation, repository artifact creation, or a content read outside allowed_paths and read_only_dependency_paths
  - git diff --check scoped to all three and only the three task paths passes
  - a fresh independent scope-sentinel that did not produce the implementation returns POST-WORK GO with no BLOCKER and no UNRELATED task-attributable change after reviewing every item required by allowed_operations
  - staging occurs only after fresh independent POST-WORK GO and uses explicit pathspecs for all three and only the three exact reviewed allowed_paths
  - after staging, the exact staged path set is all three allowed_paths, no other index entry exists, no task-path content remains unstaged, and every outside worktree status remains unchanged
  - git diff --cached --check passes
  - staged blob identities and the complete staged diff exactly match the immutable carried blobs and carried diff reviewed by the independent POST-WORK scope-sentinel
  - doctrine freshness, recovery_head, dependency cleanliness, carried-diff identity, staged integrity, and outside-manifest stability are reverified immediately before requesting human commit approval
  - explicit human approval identifies and authorizes committing the exact reviewed staged diff before any implementation commit is created
  - the implementation commit is local and non-merge, has recovery_head as its first parent, and changes exactly the three allowed_paths
  - final non-mutating verification confirms the implementation commit's parent and changed-path set, an empty index, no dependency or doctrine drift, and outside worktree statuses identical to the original manifest
  - no deployment, provider activation, network call, Firebase mutation, GCP mutation, or other external-state mutation occurred
  - no read-only dependency, doctrine path other than the exact human transition, or unrelated worktree path was changed, staged, committed, cleaned, restored, deleted, concealed, or attributed to Slice F
  - last_human_review is treated only as metadata and never as freshness evidence

stop_conditions:
  - f6ed76dcac52ab400faa82ffc5df692162dea090 is missing, unreadable, not the direct first parent of the recovery transition, or not ancestral to current HEAD
  - lane-transition authority is absent, non-unique, ambiguous, non-dedicated, a merge, superseded, not current HEAD, or fails an exact CURRENT-LANE.md blob or changed-path check
  - HEAD changes from recovery_head before creation of the explicitly approved implementation commit
  - any CURRENT-LANE.md worktree, index, blob, or history drift recurs after the exact human-applied recovery transition
  - any doctrine_freshness path is missing, unreadable, unmerged, cannot be compared mechanically, or has any reference, HEAD, index, or canonicalized worktree mismatch
  - the restored external-governance-event evidence is treated as permission to ignore, repair, or work through later doctrine drift
  - unauthorized reconnaissance-lane or concurrent-drift content is reused, restored, staged, committed, or treated as authority
  - the original immutable pre-work manifest is unavailable, altered, or hashes to anything other than 112a881461d2d31d566589f17b2a068b33f4a12fdc8aab710199b0ccd4556d9a
  - the explicitly authorized original PRE-WORK GO session evidence is unavailable, inconsistent with its exact declared facts, or treated as mechanically derivable from Git
  - either original recovery artifact is used for anything beyond interrupted-work provenance
  - an allowed path or read-only dependency path is missing, untracked, or not a regular tracked file
  - the fresh complete optional-lock-free POST-WORK manifest is absent, incomplete, altered, captured after content review or test execution, or cannot be compared mechanically with the original manifest
  - the recovery index is not empty before POST-WORK review
  - the fresh POST-WORK manifest differs from the original manifest by anything other than unstaged modifications of all three exact allowed_paths
  - any outside manifest entry has a different path or status, appears, or disappears
  - scope classification is inferred for an outside manifest entry solely from its provenance/status
  - any outside manifest entry is treated as relevant without being independently discovered as a task dependency
  - any independently discovered outside dependency is not classified under the exclusive taxonomy and treated as BLOCKER
  - any read_only_dependency_path differs from f6ed76dcac52ab400faa82ffc5df692162dea090, becomes dirty, is staged, or is included in a contemplated commit
  - the task-attributable path set cannot be derived mechanically as exactly all three allowed_paths with modify operations
  - the carried diff is not identical against f6ed76dcac52ab400faa82ffc5df692162dea090 and recovery_head
  - the complete carried-diff digest or any canonicalized allowed-path worktree blob identity changes after its initial recovery capture
  - any allowed-path content is edited, replaced, formatted, regenerated, or otherwise changed
  - the direct frontend contract test fails, does not report 20 passing tests, cannot run safely, requires network access, creates a repository artifact, or reads a repository content path outside allowed_paths and read_only_dependency_paths
  - git diff --check scoped to the exact three task paths fails
  - testing or review finds a concrete defect or any correction is required; stop without editing and obtain new explicit human authorization and a lane amendment
  - any eighth dependency, new content-read path, outside mutation, or operation beyond this exact recovery boundary is required
  - PRE-EXISTING outside content is opened, changed, staged, cleaned, restored, deleted, concealed, or attributed to Slice F
  - a command would install dependencies, use the network, create an unauthorized repository artifact, or mutate Firebase, GCP, deployment, or other external state
  - sensitive action data, password material, tokens, URL parameters, or raw Firebase errors appear in logs, test output, persisted storage, URLs, DOM diagnostics, or repository artifacts
  - fresh POST-WORK scope-sentinel evidence is incomplete, the reviewer is not independent, or the verdict is not GO
  - POST-WORK scope-sentinel identifies any BLOCKER or UNRELATED task-attributable change
  - staging occurs before POST-WORK GO, uses a broad pathspec, omits a task path, or includes any path outside allowed_paths
  - the index after staging contains any path other than all three exact allowed_paths
  - any task-path content remains unstaged after staging
  - git diff --cached --check fails
  - staged blob identities, staged path names, or the complete staged diff do not exactly match the independently reviewed immutable carried changes
  - implementation content changes after POST-WORK review or staging; do not refresh the review under this lane—stop for new human authorization and lane amendment
  - doctrine freshness, recovery_head, dependency cleanliness, carried-diff identity, staged integrity, or outside-manifest stability fails immediately before human approval
  - explicit human approval of the exact reviewed staged diff is absent, ambiguous, withdrawn, or does not identify the exact reviewed content
  - a contemplated implementation commit would be a merge, would not have recovery_head as its first parent, or would change anything other than all three exact allowed_paths
  - any deployment, activation, Firebase mutation, GCP mutation, networked integration, or external-state mutation is attempted
  - any frozen invariant would be violated
  - all acceptance_gates have been satisfied while status still claims ACTIVE

authoritative_baseline_commit: f6ed76dcac52ab400faa82ffc5df692162dea090
  # This is the authoritative product and interrupted-work provenance baseline.
  # The mechanically derived dedicated recovery-lane transition commit must be
  # its direct child and may change only CURRENT-LANE.md.
last_human_review: "2026-08-24"
  # Metadata only. Not freshness proof, recovery provenance, or lane authority.
