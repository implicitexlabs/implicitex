# CURRENT-LANE.md — Authoritative execution boundary
# =====================================================
# This file grants permission to begin work in the declared lane.
# If it is missing, malformed, internally contradictory, or does not
# authorize the requested work, scope-sentinel must return BLOCKED.
# No best-effort interpretation is permitted.
#
# STALENESS POLICY
# ────────────────
# last_human_review is metadata, not a TTL and not evidence of freshness.
# There is no calendar-based expiration. Staleness is event-driven.
# This lane is stale if:
#
#   - status is not ACTIVE
#   - authoritative_baseline_commit is unavailable or no longer belongs
#     to the ancestry of the work being evaluated
#   - any doctrine path declared under doctrine_freshness fails mechanical
#     comparison with its tracked blob at authoritative_baseline_commit
#   - lane-transition authority cannot be established mechanically under
#     lane_authorization
#   - any declared stop_condition has been satisfied
#   - all acceptance_gates required for lane completion have been satisfied
#     while status still claims ACTIVE
#     (individual acceptance gates may pass while the lane remains ACTIVE —
#      completing an individual acceptance gate is normal progress, not
#      staleness)
#   - a human-authorized lane transition has superseded this lane
#
# If freshness or lane-transition authority cannot be established from
# mechanical repository evidence:
#   BLOCKER — LANE AUTHORITY AMBIGUOUS
#
# Never use last_human_review as freshness proof.
#
# LOCAL IMPLEMENTATION INTERPRETATION
# ───────────────────────────────────
# allowed_paths is the complete product mutation boundary. It grants modify
# authority only when paired with the matching allowed_operations below.
# read_only_dependency_paths is a separate, exact content-read boundary. It
# grants no create, modify, delete, rename, stage, or commit authority.
# Doctrine reads and narrowly bounded Git metadata reads required to establish
# authority, provenance, review, staging, and commit integrity do not grant
# doctrine or product mutation authority.
#
# Existing dirty-worktree entries outside the planned paths are PRE-EXISTING
# for provenance and outside the task mutation boundary. Their contents may
# not be opened. They may not be changed, staged, cleaned, restored, deleted,
# concealed, or attributed to Slice F. Provenance does not determine scope
# classification. If any such path is later discovered to be necessary,
# classify that dependency under the normal exclusive taxonomy; because it is
# unauthorized, it is BLOCKER and work stops for human lane amendment.

lane_id: m2-slice-f-local-implementation
status: ACTIVE

objective: >
  Implement and locally test the bounded M2 Slice F browser action surface
  using only the product paths in allowed_paths and, after every entry and
  PRE-WORK gate passes, the exact content-read-only dependencies in
  read_only_dependency_paths. Accept only the exact case-sensitive modes
  verifyEmail and resetPassword with a non-empty oobCode; fail closed when a
  caller-controlled Firebase apiKey does not exactly match the trusted local
  value; perform email verification through an injected action adapter;
  verify password-reset codes before exposing the password form and confirm
  the reset afterward; and permit continuation only to the exact URL
  https://app.ixid.me/register. Immediately after synchronous capture, remove
  action query data and any fragment from browser history before validation,
  adapter invocation, rendering of sensitive state, or other asynchronous
  work. Never log, display raw errors, or persist action codes, passwords,
  tokens, URL parameters, or raw Firebase errors. Clear password material
  after use. Preserve same-origin assets, no-store, no-referrer,
  accessibility, and existing CSP and security boundaries. Produce no
  production Firebase action-adapter integration and perform no deployment,
  provider activation, GCP mutation, or other external mutation.

entry_condition: >
  A human-controlled session explicitly authorized this lane transition,
  applied this exact human-approved CURRENT-LANE.md replacement, and committed
  it as the unique dedicated one-file governance lane-transition commit
  required by lane_authorization. Commit
  2c5a0de9e9a6732bd6b87079cdc8de1402fdefb6 is available locally and is an
  ancestor of the derived lane-transition commit. At the beginning of
  pre-work, current HEAD is exactly the derived lane-transition commit, and
  the transition commit, index, and worktree contain the same approved
  CURRENT-LANE.md blob. Every path declared under doctrine_freshness
  mechanically matches its tracked baseline blob. Before any authorized
  product or read-only dependency content is opened or any implementation
  begins, the session has recorded all lane-authority and doctrine-freshness
  evidence, confirmed that every allowed path and every read-only dependency
  path is an existing tracked regular file, captured a complete immutable
  pre-work worktree manifest with Git optional locks disabled, confirmed every
  planned path and every read-only dependency path is clean in that manifest,
  and obtained an independent PRE-WORK scope-sentinel verdict of GO for the
  exact planned paths, modify operations, read-only dependencies, and proposed
  approach. Any missing, unknown, ambiguous, or failed check is BLOCKER.

lane_authorization:
  mechanism: >
    Derive the authorization commit mechanically; do not embed a
    self-referential commit SHA in this file.
  derivation: >
    Examine commits reachable from current HEAD after
    2c5a0de9e9a6732bd6b87079cdc8de1402fdefb6 that change
    docs/agent-governance/CURRENT-LANE.md. Exactly one such commit must exist.
    That commit is the derived lane-transition commit.
  required_commit_properties:
    - it is a non-merge commit with 2c5a0de9e9a6732bd6b87079cdc8de1402fdefb6 in its ancestry
    - its first-parent changed-path set is exactly docs/agent-governance/CURRENT-LANE.md
    - its tracked CURRENT-LANE.md blob is the exact human-approved replacement represented by this file
    - it is an ancestor of current HEAD
    - no later commit through current HEAD changes docs/agent-governance/CURRENT-LANE.md
    - current HEAD, the index, and the worktree contain that same CURRENT-LANE.md blob
  pre_work_head_rule: >
    When the immutable pre-work manifest is captured, current HEAD must equal
    the derived lane-transition commit. Record that commit as pre_work_head
    and require HEAD to remain unchanged through implementation, local testing,
    POST-WORK scope review, staging review, and human commit approval.
  failure_rule: >
    If the transition commit is absent, non-unique, not dedicated, not
    ancestral, superseded, differs from this approved lane blob at HEAD,
    index, or worktree, or is not current HEAD when pre-work begins, return
    BLOCKER — LANE AUTHORITY AMBIGUOUS. Product and read-only dependency
    content may not be opened and implementation may not begin.

doctrine_freshness:
  reference_commit: 2c5a0de9e9a6732bd6b87079cdc8de1402fdefb6
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
    Record the object IDs and PASS or FAIL for every path before product or
    read-only dependency content is opened, again for PRE-WORK scope review,
    and again for POST-WORK scope review and staged-integrity review.
    CURRENT-LANE.md is intentionally excluded because lane_authorization
    governs its deliberate replacement.
  failure_rule: >
    A missing path, unreadable object, object-ID mismatch, unmerged index
    entry, inability to canonicalize worktree content, or unknown result is
    BLOCKER — DOCTRINE FRESHNESS NOT ESTABLISHED. Do not open product or
    read-only dependency content, implement, stage, or commit.

allowed_paths:
  - ixid-onboarding-web/public/action.js
  - ixid-onboarding-web/public/action.html
  - ixid-onboarding-web/tests/frontend-contract.test.js

read_only_dependency_paths:
  - ixid-onboarding-web/public/config.js
  - ixid-onboarding-web/public/firebase-auth-adapter.js

allowed_read_boundaries:
  - current doctrine content limited to AGENTS.md, CLAUDE.md, .claude/agents/scope-sentinel.md, docs/agent-governance/CHARTER.md, docs/agent-governance/CURRENT-LANE.md, and docs/agent-governance/FROZEN-INVARIANTS.md
  - current working-tree content of the exact paths in allowed_paths after every entry-condition and PRE-WORK gate passes
  - current working-tree content of the exact paths in read_only_dependency_paths after every entry-condition and PRE-WORK gate passes, solely as required by the authorized implementation and local test execution
  - commit, tree, ref, ancestry, blob-object-identity, index-entry, changed-path, name-status, worktree-status, and diff metadata required for lane authority, doctrine freshness, provenance, review, staging, and commit-integrity checks
  - complete pre-work and post-work worktree manifests as path-and-status metadata only; a manifest entry outside allowed_paths and read_only_dependency_paths grants no authority to open that path
  - diffs and staged blobs limited to task-attributable changes in allowed_paths
  - output from authorized local tests, provided it contains no prohibited sensitive value or raw Firebase error
  - session-local reasoning and reporting over authorized evidence

prohibited_paths:
  - every Slice E path except the content-read-only authority for the exact files in read_only_dependency_paths
  - every product, implementation, test, configuration, documentation, operations, architecture, infrastructure, service, contract, or application path not listed in allowed_paths or read_only_dependency_paths
  - contents of untracked, ignored, or unrelated dirty-worktree files
  - direct filesystem reads of .git/**
  - credential, secret, service-account, private-key, token, and .env paths
  - ixid-onboarding-web/public/config.js for every create, modify, delete, rename, stage, or commit operation
  - ixid-onboarding-web/public/firebase-auth-adapter.js for every create, modify, delete, rename, stage, or commit operation
  - AGENTS.md for every create, modify, delete, rename, stage, or commit operation
  - CLAUDE.md for every create, modify, delete, rename, stage, or commit operation
  - .claude/agents/** for every create, modify, delete, rename, stage, or commit operation
  - docs/agent-governance/CHARTER.md for every create, modify, delete, rename, stage, or commit operation
  - docs/agent-governance/CURRENT-LANE.md for every agent-initiated create, modify, delete, rename, stage, or commit operation
  - docs/agent-governance/FROZEN-INVARIANTS.md for every create, modify, delete, rename, stage, or commit operation

allowed_operations:
  - read and parse the six doctrine files declared in allowed_read_boundaries
  - obtain current HEAD and verify baseline availability and ancestry using non-mutating Git commands
  - derive and verify the dedicated lane-transition commit under lane_authorization
  - mechanically compare doctrine blob identities under doctrine_freshness without writing Git objects
  - verify from Git metadata that every allowed path and every read-only dependency path exists as a tracked regular file
  - capture and preserve verbatim a complete immutable pre-work worktree manifest using git status --short --untracked-files=all with Git optional locks disabled
  - declare the exact planned path set as all paths in allowed_paths and the planned operation as modify for each path
  - declare the exact read-only dependency set as all paths in read_only_dependency_paths with no mutation operation
  - obtain an independent PRE-WORK scope-sentinel review of the exact requested task, planned paths, planned operations, read-only dependencies, proposed approach, repository-authority evidence, doctrine-freshness evidence, and immutable pre-work manifest
  - read the exact paths in allowed_paths after PRE-WORK scope-sentinel returns GO
  - read the exact paths in read_only_dependency_paths after PRE-WORK scope-sentinel returns GO, solely as required by the authorized implementation and local test execution
  - modify ixid-onboarding-web/public/action.js only for the authorized local Slice F action handling
  - modify ixid-onboarding-web/public/action.html only for the authorized local Slice F UI and preserved security, privacy, and accessibility contract
  - modify ixid-onboarding-web/tests/frontend-contract.test.js only for applicable local Slice F/frontend behavior and focused security tests
  - run already-available, non-networked local tests targeted to the authorized Slice F/frontend test path, permitting runtime content reads only from allowed_paths and read_only_dependency_paths and provided the command does not install dependencies or create repository artifacts
  - inspect local test output only for pass/fail diagnosis within the authorized paths and redact or stop if prohibited sensitive data appears
  - capture a complete post-work worktree manifest using git status --short --untracked-files=all with Git optional locks disabled
  - derive task-attributable changed paths mechanically from the immutable pre-work and post-work manifests and derive their actual diff mechanically against the unchanged pre_work_head
  - obtain an independent POST-WORK scope-sentinel review before staging, supplying the exact evidence required by scope-sentinel
  - after POST-WORK scope-sentinel returns GO, stage only task-attributable changed paths from allowed_paths using explicit pathspecs
  - inspect staged path names, staged blobs, and the complete staged diff for only those authorized task-attributable paths
  - run git diff --cached --check and require PASS
  - request explicit human approval to commit the exact reviewed staged diff
  - after explicit human approval, create one local non-merge implementation commit whose changed-path set is limited to the task-attributable changed paths in allowed_paths and whose first parent is pre_work_head
  - classify every proposed change and discovered dependency as exactly IN-LANE, BLOCKER, FOLLOW-ON, or UNRELATED
  - propose a clearly labeled doctrine change if a required scope expansion is discovered, then stop without applying it

explicitly_out_of_scope:
  - production Firebase action-adapter integration, classified FOLLOW-ON
  - creation, modification, deletion, rename, staging, or commit of ixid-onboarding-web/public/config.js, ixid-onboarding-web/public/firebase-auth-adapter.js, or any other Slice E file
  - content reads of repository files other than the exact doctrine paths, allowed_paths, read_only_dependency_paths, and narrowly bounded Git metadata expressly authorized by this lane
  - Slice C remediation
  - live Firebase browser end-to-end testing
  - Firebase provider activation or Firebase project mutation
  - deployment, release, publication, or environment activation
  - networked tests or calls to Firebase, GCP, or any other external service
  - GCP mutation of any kind
  - Cloud Armor, D0, or Slice D work
  - M3 planning, reconnaissance, implementation, or remediation
  - package installation, dependency updates, generators, migrations, or commands that create caches or repository artifacts
  - architecture redesign
  - changes to routes, adapters, assets, configuration, headers, build systems, test harnesses, documentation, or dependencies outside allowed_paths
  - broad product, architecture, operations, infrastructure, service, contract, or application inspection
  - opening the contents of unrelated dirty-worktree paths
  - unrelated worktree cleanup, restoration, deletion, staging, reconciliation, or attribution
  - altering or concealing pre-existing user changes
  - staging with broad pathspecs or staging any pre-existing dirty-worktree entry
  - committing without explicit human approval of the exact reviewed staged diff
  - amending, rebasing, merging, tagging, pushing, fetching, changing refs other than creation of the authorized local implementation commit, or rewriting history
  - automatic or agent-initiated doctrine mutation

acceptance_gates:
  - the authoritative baseline commit is available and ancestral to the derived lane-transition commit
  - lane-transition authority is established mechanically under lane_authorization, including uniqueness, the dedicated changed-path set, ancestry, and exact CURRENT-LANE.md blob checks
  - current HEAD equals the derived lane-transition commit when pre-work begins and is recorded immutably as pre_work_head
  - every path declared under doctrine_freshness has recorded matching reference, HEAD, index, and canonicalized worktree blob identities at every required review point
  - last_human_review is treated only as metadata and is never used as freshness evidence
  - every allowed path and every read-only dependency path is mechanically confirmed to be an existing tracked regular file
  - a complete immutable pre-work manifest is captured verbatim with Git optional locks disabled before product or read-only dependency content is opened or implementation begins
  - every planned path and every read-only dependency path is clean in the pre-work manifest; any such path appearing dirty is BLOCKER — WORKTREE COLLISION
  - pre-existing dirty-worktree entries outside planned paths and read-only dependency paths remain PRE-EXISTING provenance context only, their contents are not opened, and they are not changed, staged, cleaned, restored, deleted, concealed, or attributed to Slice F
  - no scope classification is inferred from PRE-EXISTING provenance
  - an independent scope-sentinel that did not produce the implementation returns PRE-WORK GO for the exact requested task, all allowed paths as planned paths, modify operations, the exact read-only dependencies, proposed approach, repository-authority evidence, doctrine-freshness evidence, and immutable pre-work manifest
  - mode parsing accepts only the exact case-sensitive values verifyEmail and resetPassword and rejects a missing, empty, whitespace-only, malformed, or differently cased mode
  - action handling requires a non-empty, non-whitespace oobCode and rejects missing, empty, whitespace-only, or malformed action-code input
  - a caller-controlled Firebase apiKey is never used to select or initialize a backend and is rejected fail-closed before adapter invocation when it does not exactly match the trusted local value
  - rejected mode, oobCode, apiKey, or continuation input causes zero action-adapter calls and exposes no sensitive input
  - email verification is performed only through an injected action adapter after all input checks pass, with focused success and failure coverage
  - resetPassword verifies the reset code through the injected action adapter before the password form is exposed, never exposes that form after failed preverification, and confirms the reset through the injected adapter only after valid submission
  - the only permitted continuation destination is the exact URL https://app.ixid.me/register; attacker-controlled alternative schemes, origins, ports, paths, credentials, query strings, fragments, encodings, or lookalike hosts are rejected before adapter invocation or navigation
  - action query data and any fragment are removed from the visible history entry immediately after synchronous capture and before validation, adapter invocation, sensitive rendering, or asynchronous work
  - action codes, passwords, tokens, URL parameters, and raw Firebase errors are never written to console output, logs, browser storage, cookies, IndexedDB, Cache Storage, DOM diagnostics, URLs, or persisted application state
  - raw adapter or Firebase errors are neither logged nor rendered; failure paths expose only generic safe user-facing errors
  - password input values and transient application references to password material are cleared immediately after the confirmation attempt settles on success or failure and whenever the form is abandoned or reset
  - same-origin asset loading, no-store behavior, no-referrer behavior, existing CSP restrictions, and existing security boundaries are preserved without weakening, including no new unsafe inline or remote-content allowance
  - the resulting UI preserves accessible names, associated labels, keyboard operation, understandable status/error announcement, and appropriate focus behavior
  - applicable local Slice F/frontend tests and focused security tests pass without network access, external mutation, dependency installation, or repository artifact creation
  - authorized test execution content-reads no repository dependency outside allowed_paths and read_only_dependency_paths
  - focused tests cover rejected modes and codes, zero adapter calls for rejected input, email-verification success and failure, reset preverification and confirmation, malicious continuation rejection, apiKey mismatch, password clearing, generic safe errors, and absence of logging or storage
  - the complete optional-lock-free post-work manifest is captured before staging and the task-attributable path set is derived mechanically from its difference with the immutable pre-work manifest
  - every task-attributable change is a modify operation on a path in allowed_paths, no outside path is task-attributable, and the actual diff is derived mechanically against the unchanged pre_work_head
  - both read_only_dependency_paths remain clean and unchanged through POST-WORK review, staging, and commit
  - an independent scope-sentinel that did not produce the implementation returns POST-WORK GO with no BLOCKER and no UNRELATED task-attributable change after reviewing both manifests, the mechanically derived task-attributable path set, actual diff, repository-authority evidence, and frozen invariants
  - staging occurs only after POST-WORK GO and the exact staged path set contains only task-attributable changed paths from allowed_paths; an allowed path that did not change need not be staged
  - git diff --cached --check passes
  - staged blobs, staged path names, and the complete staged diff correspond exactly to the task-attributable changes reviewed by the independent POST-WORK scope-sentinel
  - no implementation content changes after POST-WORK review; any later change invalidates the review and requires a fresh optional-lock-free post-work manifest, mechanical derivation, tests, and independent POST-WORK GO
  - explicit human approval identifies and authorizes committing the exact reviewed staged diff before any implementation commit is created
  - any implementation commit is local, non-merge, has pre_work_head as its first parent, and changes only the task-attributable changed paths from allowed_paths
  - no deployment, provider activation, network call, Firebase mutation, GCP mutation, or other external-state mutation occurred
  - no doctrine file, read-only dependency path, or unrelated worktree path was changed, staged, committed, cleaned, restored, deleted, concealed, or attributed to Slice F

stop_conditions:
  - the authoritative baseline commit is missing, unreadable, or not ancestral to the derived lane-transition commit
  - lane-transition authority is missing, non-unique, ambiguous, not dedicated, not ancestral, superseded, or fails an exact CURRENT-LANE.md blob check
  - current HEAD is not exactly the derived lane-transition commit when pre-work begins
  - HEAD changes after pre_work_head is recorded and before the human-approved implementation commit is created
  - any path declared under doctrine_freshness is missing, unreadable, unmerged, cannot be compared mechanically, or has any reference, HEAD, index, or canonicalized worktree blob mismatch
  - last_human_review would have to be relied upon to establish freshness
  - an allowed path or read-only dependency path is missing, untracked, not a regular tracked file, or dirty in the pre-work manifest
  - the complete immutable pre-work manifest was not captured verbatim with Git optional locks disabled before product or read-only dependency content was opened or implementation began
  - PRE-WORK scope-sentinel evidence is incomplete or the independent verdict is not GO
  - implementation requires creating, deleting, or renaming an allowed path instead of modifying it
  - implementation requires modifying ixid-onboarding-web/public/config.js, ixid-onboarding-web/public/firebase-auth-adapter.js, any other Slice E file, or any path or operation not expressly authorized by this lane
  - frontend-contract.test.js, implementation, or test execution proves that any repository file outside allowed_paths and read_only_dependency_paths must be content-read or modified; classify it BLOCKER and stop for human lane amendment without automatic broadening
  - a discovered required dependency is outside the exact authorized content-read or mutation boundaries; classify it under the normal exclusive taxonomy and, because it is unauthorized, treat it as BLOCKER and stop for human lane amendment
  - production Firebase action-adapter integration, Slice C remediation, live Firebase browser E2E, provider activation, deployment, GCP mutation, Cloud Armor, D0, Slice D, or M3 work is proposed or begun
  - a PRE-EXISTING dirty-worktree path outside planned paths and read-only dependency paths is opened, changed, staged, cleaned, restored, deleted, concealed, or attributed to Slice F
  - scope classification is inferred from PRE-EXISTING provenance
  - a command would install dependencies, use the network, create an unauthorized repository artifact, or mutate Firebase, GCP, deployment, or other external state
  - sensitive action data, password material, tokens, URL parameters, or raw Firebase errors appear in logs, test output, persisted storage, URLs, DOM diagnostics, or repository artifacts
  - an authorized security, privacy, behavior, accessibility, or test acceptance gate cannot be met within the exact mutation and read-only dependency boundaries
  - the optional-lock-free post-work manifest is absent, incomplete, altered, or cannot be compared mechanically with the immutable pre-work manifest
  - task-attributable changes cannot be derived mechanically or include a path or operation outside the exact authorization boundary
  - any outside manifest entry changes status during the task or provenance becomes ambiguous
  - a read-only dependency path changes, is staged, or is included in a contemplated commit
  - applicable local tests fail, cannot be run safely, require network access, or require a repository content read or operation outside this lane
  - POST-WORK scope-sentinel evidence is incomplete, the reviewer is not independent, or the verdict is not GO
  - POST-WORK scope-sentinel identifies any BLOCKER or UNRELATED task-attributable change
  - staging contains any path not both task-attributable and listed in allowed_paths
  - git diff --cached --check fails
  - staged path names, blobs, or diff do not correspond exactly to the independently reviewed task-attributable changes
  - implementation content changes after POST-WORK review without a fresh manifest, mechanical derivation, test run, and independent POST-WORK GO
  - explicit human approval of the exact reviewed staged diff is absent, ambiguous, or withdrawn; stop before commit
  - a contemplated commit would be a merge, would not have pre_work_head as its first parent, or would include any path outside the reviewed staged boundary
  - any deployment, activation, Firebase mutation, GCP mutation, networked integration, or external-state mutation is attempted
  - any frozen invariant would be violated
  - all acceptance_gates have been satisfied while status still claims ACTIVE

authoritative_baseline_commit: 2c5a0de9e9a6732bd6b87079cdc8de1402fdefb6
  # Completed m2-slice-f-readonly-reconnaissance HEAD.
  # This is the tracked implementation and pre-work baseline.
  # The mechanically derived dedicated lane-transition commit is distinct
  # from this baseline and may change only CURRENT-LANE.md.
last_human_review: "2026-08-23"
  # Metadata only. Not freshness proof and not lane-transition authority.
