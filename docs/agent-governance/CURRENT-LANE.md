# CURRENT-LANE.md — Authoritative execution boundary
# =====================================================
# This file grants permission to begin work in the declared lane.
# If it is missing, malformed, internally contradictory, or does not
# authorize the requested work, scope-sentinel must return BLOCKED.
# No best-effort interpretation is permitted.
#
# STALENESS POLICY
# ────────────────
# last_human_review is metadata, not a TTL. There is no calendar-based
# expiration. Staleness is event-driven. This lane is stale if:
#
#   - status is not ACTIVE
#   - authoritative_baseline_commit is unavailable or no longer belongs
#     to the ancestry of the work being evaluated
#   - any declared stop_condition has been satisfied; or
#   - all acceptance_gates required for lane completion have been satisfied
#     while status still claims ACTIVE
#   (individual acceptance gates may pass while the lane remains ACTIVE —
#    completing an individual acceptance gate is normal progress, not staleness)
#   - authoritative doctrine on which this lane depends (CHARTER,
#     FROZEN-INVARIANTS) changed after last_human_review without an
#     explicit lane re-review
#
# BOOTSTRAP EXCEPTION (phase-0-agent-governance-foundation only)
# ────────────────────────────────────────────────────────────────
# Initial creation and human-authorized revision of the doctrine
# artifacts expressly authorized by this lane's allowed_paths do not
# independently stale this bootstrap lane. This exception expires when
# Phase 0 closes. After Phase 0, creation or substantive modification
# of authoritative doctrine requires explicit human lane re-review
# before execution continues.
#
#   - a human-authorized lane transition has superseded this lane
#
# If freshness cannot be established from available evidence:
#   BLOCKER — LANE AUTHORITY AMBIGUOUS
#
# Never assume freshness merely because last_human_review is recent.

lane_id: phase-0-agent-governance-foundation
status: ACTIVE

objective: >
  Establish the minimum shared governance layer required for Claude and Codex
  to operate against the same authoritative scope doctrine. This is a
  human-authorized bootstrap lane. scope-sentinel does not yet govern this
  lane; it is being created by it.

entry_condition: >
  Authorized explicitly by human session 2026-08-23. Both active product-lane
  threads (Slice C Firebase callbackUri, Slice D Cloud Armor quota) are parked
  on external dependencies. Phase 0 has no external dependencies and is
  self-contained.

allowed_paths:
  - docs/agent-governance/CHARTER.md
  - docs/agent-governance/CURRENT-LANE.md
  - docs/agent-governance/FROZEN-INVARIANTS.md
  - AGENTS.md
  - CLAUDE.md
  - .claude/agents/scope-sentinel.md

prohibited_paths:
  - app-web/**
  - ixid-onboarding-web/**
  - ixid-identity-page/**
  - infra/**
  - services/**
  - contracts/**
  - coincard/**
  - docs/architecture/**
  - docs/agent-governance/coordination/**
  - .claude/agents/roadmap-steward.md
  - .claude/agents/release-sheriff.md

allowed_operations:
  - create: docs/agent-governance/CHARTER.md
  - create: docs/agent-governance/CURRENT-LANE.md
  - create: docs/agent-governance/FROZEN-INVARIANTS.md
  - create: AGENTS.md
  - create: CLAUDE.md
  - create: .claude/agents/scope-sentinel.md

explicitly_out_of_scope:
  - roadmap-steward agent
  - release-sheriff agent
  - coordination bus (TASKS/CLAIMS/RESULTS/HANDOFFS directories or scripts)
  - claim/lock scripts
  - scheduled agents or routines
  - Codex subagent implementation beyond AGENTS.md
  - source code changes of any kind
  - test changes
  - GCP or Firebase configuration changes
  - Slice C remediation (Firebase callbackUri)
  - Slice D remediation (Cloud Armor quota)
  - automatic or agent-initiated doctrine mutation

acceptance_gates:
  - CHARTER.md exists and defines: authority hierarchy, scope classifications, doctrine-freeze rule, cross-platform model
  - CURRENT-LANE.md exists with all required fields and fails closed when missing or malformed
  - FROZEN-INVARIANTS.md exists and lists invariants that cannot be overridden by lane documents
  - AGENTS.md exists at repo root and points to canonical governance docs with scope-classification taxonomy
  - CLAUDE.md exists at repo root and points to canonical governance docs with scope-classification taxonomy
  - .claude/agents/scope-sentinel.md exists and implements IN-LANE/BLOCKER/FOLLOW-ON/UNRELATED taxonomy
  - scope-sentinel self-audits the complete Phase 0 diff and reports each changed file
  - scope-sentinel finds no BLOCKER or UNRELATED items in the Phase 0 diff
  - staged path set contains exactly the six authorized Phase 0 paths
  - git diff --cached --check passes on the staged Phase 0 files
  - human inspects and approves the staged diff
  - Phase 0 commit lands containing exactly those six paths

stop_conditions:
  - any task-attributable file outside allowed_paths is modified or created
  - task-attributable source code, tests, or infrastructure is touched
  - task-attributable GCP or Firebase state is changed
  - scope-sentinel self-audit returns any BLOCKER item
  - an agent proposes to build roadmap-steward or release-sheriff under this lane's authorization

authoritative_baseline_commit: ece9554e4960d5b41ce2972712f574957601a4dc
  # Authoritative tracked repository baseline for Phase 0.
  # Establishes Git ancestry only; it does not assert when untracked
  # governance files first appeared.
  # Not the commit that contains this file — a git commit cannot contain its own SHA.
  # Future sentinels reason: baseline → authorized lane changes → current diff.
last_human_review: "2026-08-23"
