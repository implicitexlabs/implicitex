lane_id: m2-slice-g-action-adapter-integration
status: ACTIVE
amendment: 1

# CURRENT-LANE.md — Authoritative execution boundary
# ====================================================
# Amendment 1 (2026-08-24): adds action-adapter.js as third writable path,
# adds local-resource dependency gate, expands adapter test matrix.
# Original lane authorized at aaf8347; this amendment is its direct child.
#
# Authorizes production Firebase action-adapter integration for the
# ixid-onboarding-web action page, local-only. No Firebase mutation,
# provider activation, deployment, or networked production call is
# authorized by this lane.
#
# If this file is missing, malformed, internally contradictory, or does not
# authorize the requested work, scope-sentinel must return BLOCKED.
# No best-effort interpretation is permitted.

objective: >
  (1) The continueUrl contract clarification is resolved: NO AMENDMENT REQUIRED.
  "Silently ignored" in §1.6 governs unsafe redirect handling, not an obligation
  to proceed without continueUrl. The stricter implementation is conformant. This
  resolution is part of the PRE-WORK evidence and requires no further action.
  (2) Create action-adapter.js — a new file implementing the three one-time
  action-code methods required by action.js:
    applyActionCode(oobCode)
    verifyPasswordResetCode(oobCode)
    confirmPasswordReset(oobCode, newPassword)
  Architectural separation is mandatory: firebase-auth-adapter.js owns
  session/identity lifecycle; action-adapter.js owns only these three
  action-code operations. action-adapter.js must not import from, re-export
  from, or modify firebase-auth-adapter.js.
  (3) Satisfy the local-resource dependency gate (see below) before writing
  any implementation. If those three methods cannot be implemented through
  the existing permitted resource model, return BLOCKER and stop.
  (4) Wire IXID_ACTION_ADAPTER in action.html using action-adapter.js via
  the existing permitted local resource model only. No new remote script
  origin, CDN dependency, CSP change, package installation, or additional
  writable path is authorized. If required, return BLOCKER and stop.
  (5) action.js stays read-only. If wiring requires an action.js change,
  return BLOCKER and stop for a lane amendment.
  (6) Add action-adapter.test.js covering the full required test matrix.
  (7) Preserve the no-secret-logging and fail-closed invariants from Slice F.
  Perform no Firebase mutation, provider activation, deployment, or networked
  production call. Stop for independent PRE-WORK review before any
  implementation edit. Stop for independent POST-WORK review and explicit
  human commit approval before committing.

authoritative_baseline_commit: 97fcada
lane_amendment_parent: aaf8347

contract_clarification:
  status: RESOLVED — NO AMENDMENT REQUIRED
  record: >
    Resolved in PRE-WORK sentinel report at aaf8347. The frozen §1.6 contract
    phrase "silently ignored" addresses the security concern of not following
    arbitrary caller-supplied redirects. It does not require the action handler
    to proceed without continueUrl. Legitimate action links include continueUrl
    when ActionCodeSettings.url is set. The implementation's stricter behavior
    (requiring exactly one matching continueUrl, failing closed if absent) is a
    conformant security posture. No §1.6 amendment required.

local_resource_dependency_gate:
  required_before_implementation: true
  question: >
    Before writing action-adapter.js, mechanically establish:
    (a) What Firebase SDK or API surface do applyActionCode, verifyPasswordResetCode,
        and confirmPasswordReset require? Read firebase-auth-adapter.js to determine
        what Firebase object it receives and how it calls Firebase methods.
    (b) Can action-adapter.js obtain or receive the same Firebase Auth instance
        through the existing permitted resource model — i.e., via a script tag
        pointing to a file already served from app.ixid.me/self, or via a shared
        module already loaded in the same page context — without adding a new
        remote origin, CDN load, CSP change, package install, or additional
        writable path?
    (c) Will action.html be able to inject the Firebase Auth instance into
        action-adapter.js without modifying action.js?
  resolution: >
    Document the exact dependency chain (what action-adapter.js requires and
    how it will receive it) in the PRE-WORK scope-sentinel report before
    any implementation edit. If any dependency falls outside the permitted
    resource model, the report must state BLOCKER and stop.
  failure_rule: >
    If the dependency chain cannot be established within the existing permitted
    resource model, or if it requires any path, origin, or resource not in
    allowed_write_paths or the existing action.html permitted model, return
    BLOCKER and stop. Do not implement first and discover this later.

allowed_write_paths:
  - ixid-onboarding-web/public/action-adapter.js
  - ixid-onboarding-web/public/action.html
  - ixid-onboarding-web/tests/action-adapter.test.js

read_only_paths:
  - ixid-onboarding-web/public/action.js
  - ixid-onboarding-web/public/firebase-auth-adapter.js
  - ixid-onboarding-web/public/config.js
  - ixid-onboarding-web/public/index.html
  - ixid-onboarding-web/public/register.js
  - ixid-onboarding-web/public/onboarding-core.js
  - ixid-onboarding-web/public/holder-api-client.js
  - ixid-onboarding-web/public/register.css
  - ixid-onboarding-web/tests/frontend-contract.test.js
  - docs/architecture/ixid-onboarding-v0.1.md

doctrine_freshness:
  reference_commit: 97fcada
  paths:
    - AGENTS.md
    - CLAUDE.md
    - .claude/agents/scope-sentinel.md
    - docs/agent-governance/CHARTER.md
    - docs/agent-governance/FROZEN-INVARIANTS.md

prohibited_operations:
  - any edit to action.js — if required, return BLOCKER and stop
  - any import from, re-export from, or modification of firebase-auth-adapter.js
    within action-adapter.js
  - any new remote script origin, CDN load, CSP change, or external resource
    addition to action.html — if required, return BLOCKER and stop
  - any package installation or dependency update
  - any Firebase Auth mutation (creating users, enabling providers, changing
    project configuration, sending emails)
  - any GCP mutation
  - any deployment or publication
  - any networked test or call to Firebase, GCP, or any external service
  - any change to read-only paths
  - any change to doctrine files other than this exact human-applied amendment
  - any path outside allowed_write_paths and read_only_paths

required_test_matrix:
  file: ixid-onboarding-web/tests/action-adapter.test.js
  cases:
    - applyActionCode success (verifyEmail happy path)
    - applyActionCode Firebase rejection (throws → fail closed, no redirect)
    - verifyPasswordResetCode success (resetPassword pre-verification passes)
    - verifyPasswordResetCode Firebase rejection (throws → fail closed, no form shown)
    - confirmPasswordReset success (password reset completes, redirect to ALLOWED_CONTINUE_URL)
    - confirmPasswordReset Firebase rejection (throws → fail closed, error state)
    - invalid mode (not verifyEmail or resetPassword → fail closed, no SDK call)
    - missing oobCode (absent or empty → fail closed before any SDK call)
    - invalid oobCode (whitespace, overlength → fail closed)
    - missing continueUrl (absent → fail closed)
    - mismatched continueUrl (non-allowlisted → fail closed)
    - no secret leakage (oobCode, password not in error surfaces or logs)
  note: >
    verifyPasswordResetCode is a security gate — its rejection path must have
    its own explicit test case proving the password form is never shown and no
    confirmPasswordReset call is attempted.

acceptance_gates:
  - authoritative_baseline_commit (97fcada) is reachable; the original lane
    transition (aaf8347) and this amendment are both in its ancestry; this
    amendment is the direct parent of any implementation work
  - doctrine_freshness passes at PRE-WORK, POST-WORK, and pre-commit review
  - contract_clarification status is RESOLVED — NO AMENDMENT REQUIRED
    (established in prior PRE-WORK; confirmed in this PRE-WORK review)
  - local_resource_dependency_gate resolution is documented in PRE-WORK
    report with a concrete dependency chain before any implementation edit
  - independent PRE-WORK scope-sentinel returns GO with no BLOCKER
  - action-adapter.js and action-adapter.test.js are absent from the repo
    at PRE-WORK (will be created); action.html is tracked
  - all other read_only_paths are existing tracked regular files
  - implementation makes no edit outside allowed_write_paths
  - action.js is unchanged from 97fcada through commit
  - firebase-auth-adapter.js is unchanged from 97fcada through commit
  - action-adapter.js does not import from or re-export firebase-auth-adapter.js
  - no new remote script origin, CDN load, CSP change, or external resource
    appears in action.html
  - existing frontend-contract.test.js suite passes: 20 tests, 0 failures,
    unchanged from Slice F
  - node ixid-onboarding-web/tests/action-adapter.test.js passes all cases
    in required_test_matrix with zero failures
  - git diff --check passes for all changed paths
  - no networked call, Firebase mutation, GCP mutation, or deployment occurred
  - independent POST-WORK scope-sentinel returns GO with no BLOCKER
  - explicit human commit approval received before committing

explicitly_out_of_scope:
  - action.js changes of any kind
  - firebase-auth-adapter.js changes of any kind
  - CSP changes or new external resource origins
  - runbook authoring or activation-sequence documentation
  - Firebase step-4 configuration or custom action URL verification
  - Cloud Armor / Slice D
  - M3 and later milestones
  - provider activation or Firebase project mutation of any kind
  - register.js, onboarding-core.js, or other read-only path changes
  - any path outside allowed_write_paths and read_only_paths

last_human_review: "2026-08-24"
  # Metadata only. Not freshness proof or authorization.
