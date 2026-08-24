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
# READ-ONLY INTERPRETATION
# ────────────────────────
# In this lane, allowed_paths and allowed_read_boundaries grant content-read
# authority only. They grant no create, modify, delete, stage, commit, deploy,
# activation, or external-state mutation authority. A path does not become
# readable merely because it might be useful. It must satisfy an explicit
# selector and the discovery protocol below.

lane_id: m2-slice-f-readonly-reconnaissance
status: ACTIVE

objective: >
  Perform bounded, read-only reconnaissance of the Slice F /auth/action
  surface and bounded, read-only assessment of repository-held Slice C
  Firebase configuration or evidence, then determine from cited repository
  evidence whether and how the two slices depend on one another. Produce
  findings only in session output. Do not implement, remediate, deploy,
  activate, stage, commit, or mutate repository or external state.

entry_condition: >
  A human-controlled session explicitly authorized this lane transition and
  committed this exact human-approved CURRENT-LANE.md replacement in the
  dedicated governance lane-transition commit required by lane_authorization.
  Commit 162eeb0a5ae4efeed0e208593321bad41dd259fe is available locally and is
  an ancestor of both the derived lane-transition commit and current HEAD.
  The derived lane-transition commit is an ancestor of current HEAD. The
  CURRENT-LANE.md blob in that commit, current HEAD, the index, and the
  worktree are identical. Every path declared under doctrine_freshness
  mechanically matches its tracked Phase 0 blob as specified there. Before
  any Slice C or Slice F candidate content is read, the session has recorded
  all lane-authority and doctrine-freshness evidence and captured a complete
  pre-reconnaissance worktree manifest using a Git invocation that disables
  optional locks. If any check is missing, unknown, ambiguous, or fails,
  return BLOCKER and do not begin reconnaissance.

lane_authorization:
  mechanism: >
    Derive the authorization commit mechanically; do not embed a
    self-referential commit SHA in this file.
  derivation: >
    Examine commits reachable from current HEAD after
    162eeb0a5ae4efeed0e208593321bad41dd259fe that change
    docs/agent-governance/CURRENT-LANE.md. Exactly one such commit must exist.
    That commit is the derived lane-transition commit.
  required_commit_properties:
    - it is a non-merge commit with 162eeb0a5ae4efeed0e208593321bad41dd259fe in its ancestry
    - its changed-path set relative to its first parent is exactly docs/agent-governance/CURRENT-LANE.md
    - its tracked CURRENT-LANE.md blob is the exact human-approved replacement represented by this file
    - it is an ancestor of current HEAD
    - no later commit through current HEAD changes docs/agent-governance/CURRENT-LANE.md
    - current HEAD, the index, and the worktree contain that same CURRENT-LANE.md blob
  failure_rule: >
    If the transition commit is absent, non-unique, not dedicated, not
    ancestral, superseded, or its lane blob differs at HEAD, index, or
    worktree, return BLOCKER — LANE AUTHORITY AMBIGUOUS. Candidate content
    may not be read.

doctrine_freshness:
  reference_commit: 162eeb0a5ae4efeed0e208593321bad41dd259fe
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
    Record the object IDs and PASS or FAIL for every path. CURRENT-LANE.md is
    intentionally excluded because lane_authorization governs its deliberate
    replacement.
  failure_rule: >
    A missing path, unreadable object, object-ID mismatch, unmerged index
    entry, inability to canonicalize the worktree content, or unknown result
    is BLOCKER — DOCTRINE FRESHNESS NOT ESTABLISHED. Candidate content may
    not be read.

# These are content-read selectors, not write permissions.
allowed_paths:
  - AGENTS.md
  - CLAUDE.md
  - .claude/agents/scope-sentinel.md
  - docs/agent-governance/CHARTER.md
  - docs/agent-governance/CURRENT-LANE.md
  - docs/agent-governance/FROZEN-INVARIANTS.md
  - repository metadata exposed by read-only Git commands, limited to authority checks, doctrine blob-identity checks, path discovery, candidate history metadata, and worktree manifests
  - tracked baseline blobs at 162eeb0a5ae4efeed0e208593321bad41dd259fe that qualify as direct-match candidates under read_discovery_protocol
  - tracked baseline blobs at 162eeb0a5ae4efeed0e208593321bad41dd259fe that qualify as one-hop referenced candidates under read_discovery_protocol

allowed_read_boundaries:
  - current doctrine content, limited to the six doctrine paths listed above
  - commit, tree, ref, ancestry, blob-object-identity, index-entry, changed-path, path-name, name-status, and worktree-status metadata exposed by non-mutating Git commands
  - mechanical blob-identity evidence for the paths declared under doctrine_freshness
  - mechanical commit and blob-identity evidence required by lane_authorization
  - fixed-string match lines returned from tracked baseline blobs by the exact discovery terms declared below
  - complete content of an individually qualified direct-match candidate at the authoritative baseline
  - complete content of an individually qualified one-hop referenced candidate at the authoritative baseline
  - candidate-specific Git history metadata when necessary to distinguish provenance from current behavior; historical blob contents remain prohibited
  - session-local reasoning over captured evidence and read-only reporting in session output

read_discovery_protocol:
  authoritative_snapshot: 162eeb0a5ae4efeed0e208593321bad41dd259fe

  path_name_discovery:
    - list tracked path names at the authoritative snapshot without reading their contents
    - a path-name direct candidate must have basename exactly firebase.json or .firebaserc, contain a slice-c or slice-f path component, or contain the exact path-segment sequence auth/action
    - path-name listing grants no authority to read paths that do not meet one of those conditions

  fixed_string_discovery:
    - search tracked baseline blobs only
    - use fixed-string matching; do not substitute regex, fuzzy, semantic, case-folded, or broader keyword searches
    - permitted fixed strings are:
      - /auth/action
      - auth/action
      - callbackUri
      - callback_uri
      - actionCodeSettings
      - continueUrl
      - handleCodeInApp
      - Slice C
      - Slice F
    - the returned match line may be inspected
    - complete candidate content may be read only when the path and match line together provide direct evidence about Slice F /auth/action, Slice C Firebase callback/configuration evidence, or their dependency relationship
    - an incidental, generated, vendored, or contextually irrelevant match does not qualify the containing file for a complete read

  one_hop_reference_discovery:
    - begin only from a qualified direct-match candidate
    - permit one additional tracked baseline blob only when the direct candidate contains an explicit, unambiguous repository-local import, configuration pointer, route reference, or evidence reference to that exact path
    - record the originating candidate, the exact reference, the resolved path, and why the one-hop read is necessary to answer the lane objective
    - do not follow references found in the one-hop candidate
    - do not infer a path from naming convention, directory adjacency, framework convention, or expected architecture
    - an ambiguous, missing, second-hop, directory-wide, generated, or external reference is not authorized

  root_scope_rule:
    - qualification applies to an individual tracked blob, never to its directory, siblings, package, service, or repository root
    - a qualifying file under infra/** does not authorize infra/** or any sibling
    - a qualifying file under docs/operations/** does not authorize docs/operations/** or any sibling
    - a qualifying file under a product or service root does not authorize that root or any sibling
    - if the objective cannot be answered within direct-match and one-hop candidates, classify the required expansion as BLOCKER and stop for human lane amendment

  sensitive_content_rule:
    - do not read credential files, service-account material, private keys, tokens, secrets, .env files, untracked files, or ignored files even if a path or match would otherwise qualify
    - if sensitive content is required to answer the objective, classify it as BLOCKER and stop without exposing it

prohibited_paths:
  - contents of untracked, ignored, or unrelated dirty-worktree files
  - working-tree product, architecture, operations, infrastructure, service, contract, or application contents; qualifying evidence must be read from the authoritative Git snapshot
  - product or configuration tracked blobs at commits other than the authoritative snapshot
  - historical blob contents, except the current content at the authoritative snapshot
  - direct filesystem reads of .git/**
  - credential, secret, service-account, private-key, token, and .env paths
  - infra/** as a directory-level or root-level read grant
  - docs/operations/** as a directory-level or root-level read grant
  - app-web/** as a directory-level or root-level read grant
  - ixid-onboarding-web/** as a directory-level or root-level read grant
  - ixid-identity-page/** as a directory-level or root-level read grant
  - services/** as a directory-level or root-level read grant
  - contracts/** as a directory-level or root-level read grant
  - docs/architecture/** as a directory-level or root-level read grant
  - any path that has not qualified through read_discovery_protocol

allowed_operations:
  - read and parse the six doctrine files listed in allowed_paths
  - obtain current HEAD and verify authoritative-baseline availability and ancestry using non-mutating Git commands
  - derive and verify the dedicated lane-transition commit under lane_authorization
  - mechanically compare doctrine blob identities under doctrine_freshness without writing Git objects
  - capture pre- and post-reconnaissance worktree manifests using Git with optional locks disabled
  - list tracked path names at the authoritative snapshot
  - run only the declared fixed-string discovery searches against tracked blobs at the authoritative snapshot
  - read individually qualified direct-match baseline blobs
  - read individually qualified one-hop referenced baseline blobs
  - inspect candidate-specific commit and path-history metadata without reading historical blob contents
  - classify every inspected path and discovered dependency as exactly IN-LANE, BLOCKER, FOLLOW-ON, or UNRELATED
  - compare and reason over captured repository evidence
  - report observations, citations, evidence gaps, classifications, and the dependency conclusion in session output only
  - propose a clearly labeled doctrine change if a required scope expansion is discovered, then stop without applying it

explicitly_out_of_scope:
  - repository mutation of any kind
  - creating, modifying, deleting, renaming, formatting, or generating files
  - Slice F implementation or repair
  - Slice C remediation, including callbackUri or related Firebase changes
  - staging, committing, amending, rebasing, merging, tagging, pushing, fetching, or changing refs
  - running builds, tests, generators, installers, package managers, formatters, migrations, or commands that may create caches or artifacts
  - deployment, release, Firebase activation, Firebase project mutation, or Firebase console/API mutation
  - authenticated inspection of a live Firebase project, GCP project, deployment target, or other external system
  - GCP mutations of any kind
  - Cloud Armor, D0, or Slice D work
  - M3 planning, implementation, reconnaissance, or remediation
  - architecture redesign
  - broad infrastructure or operations-document review
  - recursive dependency traversal beyond the authorized one-hop rule
  - reading unrelated worktree content
  - unrelated worktree cleanup, restoration, deletion, staging, or reconciliation
  - altering or concealing pre-existing user changes
  - automatic or agent-initiated doctrine mutation

acceptance_gates:
  - the authoritative Phase 0 commit is available and ancestral to the derived lane-transition commit and current HEAD
  - lane-transition authority is established mechanically under lane_authorization, including the dedicated changed-path set and exact CURRENT-LANE.md blob checks
  - every path declared under doctrine_freshness has recorded matching reference, HEAD, index, and canonicalized worktree blob identities
  - last_human_review is treated only as metadata and is not used as freshness evidence
  - a pre-reconnaissance worktree manifest is captured after authority and doctrine-freshness checks pass and before any candidate content read
  - every inspected non-doctrine content path is traceable to a permitted direct-match or one-hop selector, with its qualifying evidence recorded
  - Slice F /auth/action reconnaissance identifies the baseline-observable route or action surface, its relevant inputs and outputs, and its repository-local references, or explicitly records that bounded discovery found no qualifying evidence
  - Slice C assessment identifies the baseline-observable Firebase callback/configuration evidence and distinguishes configured fact, documentary claim, inference, absence of evidence, and external-state unknown
  - the Slice F-to-Slice C dependency conclusion is stated as supported, not supported by bounded evidence, or unresolved within the lane, with baseline path-and-line citations for every factual claim
  - every discovered item receives exactly one IN-LANE, BLOCKER, FOLLOW-ON, or UNRELATED classification
  - no necessary but unauthorized dependency is treated as IN-LANE
  - the result explicitly states that repository evidence does not prove live Firebase or GCP state
  - a post-reconnaissance worktree manifest is captured with optional locks disabled and is identical to the pre-reconnaissance manifest
  - no repository, index, ref, Firebase, deployment, GCP, or other external state was changed
  - findings exist only in session output and contain no credential or secret material

stop_conditions:
  - the authoritative Phase 0 commit is missing, unreadable, or not ancestral to the derived lane-transition commit or current HEAD
  - lane-transition authority is missing, non-unique, ambiguous, not dedicated, not ancestral, superseded, or fails any exact CURRENT-LANE.md blob check
  - any path declared under doctrine_freshness is missing, unreadable, unmerged, cannot be compared mechanically, or has any reference, HEAD, index, or canonicalized worktree blob mismatch
  - last_human_review would have to be relied upon to establish freshness
  - a repository mutation occurs or a contemplated operation could mutate repository, index, ref, cache, artifact, deployment, Firebase, GCP, or other external state
  - any task-attributable file creation, modification, deletion, rename, staging, or commit is detected
  - pre- and post-reconnaissance worktree manifests differ
  - a candidate path cannot be qualified unambiguously under read_discovery_protocol
  - answering the objective would require a broader search term, directory-wide read, sibling inference, second dependency hop, historical blob read, live-system access, secret access, or path outside the permitted selectors
  - Slice F implementation or Slice C remediation is proposed or begun
  - Cloud Armor, D0, Slice D, or M3 work is proposed or begun
  - unrelated dirty-worktree content is opened, altered, cleaned, staged, restored, or deleted
  - a discovered required dependency is not expressly authorized by this lane
  - sensitive content is encountered or appears necessary
  - any frozen invariant would be violated
  - all acceptance_gates have been satisfied while status still claims ACTIVE

authoritative_baseline_commit: 162eeb0a5ae4efeed0e208593321bad41dd259fe
  # Sealed Phase 0 governance baseline and authoritative repository snapshot
  # for Slice F/C product and configuration evidence.
  # Establishes Git ancestry and the only product/configuration blob snapshot
  # authorized for content reads.
  # It is intentionally distinct from the mechanically derived dedicated
  # governance lane-transition commit.
  # It does not authorize worktree product reads or any mutation.
last_human_review: "2026-08-23"
  # Metadata only. Not freshness proof and not lane-transition authority.
