lane_id: m2-slice-g-action-adapter-integration
status: ACTIVE

# CURRENT-LANE.md — Authoritative execution boundary
# ====================================================
# Authorizes production Firebase action-adapter integration for the
# ixid-onboarding-web action page, local-only. No Firebase mutation,
# provider activation, deployment, or networked production call is
# authorized by this lane.
#
# If this file is missing, malformed, internally contradictory, or does not
# authorize the requested work, scope-sentinel must return BLOCKED.
# No best-effort interpretation is permitted.

objective: >
  (1) Resolve the continueUrl contract discrepancy in §1.6 of the frozen M2
  contract before any implementation edit. The PRE-WORK scope-sentinel report
  is the authoritative lane clarification record for this determination; no
  separate evidence file is required or authorized.
  (2) Wire IXID_ACTION_ADAPTER with a real Firebase auth adapter into action.html
  using only the existing permitted local resource model. The existing CSP on
  action.html enforces default-src 'self' with connect-src limited to the
  Firebase API endpoints. Adapter wiring must not add any remote script origin,
  CDN dependency, new external resource, or CSP change. If the existing adapter
  cannot be wired without such an expansion, classify that dependency as BLOCKER
  and stop for a lane amendment.
  (3) Keep action.js read-only. If wiring the adapter through action.html
  requires a change to action.js, classify that dependency as BLOCKER and stop
  for a lane amendment; do not pre-authorize the change.
  (4) Add action-adapter.test.js as a new separate test file covering all seven
  adapter-boundary cases. Existing frontend-contract.test.js (20 tests) must
  continue to pass unchanged.
  (5) Preserve the no-secret-logging and fail-closed invariants from the Slice F
  contract audit.
  Perform no Firebase mutation, provider activation, deployment, or networked
  production call. Stop for independent PRE-WORK scope review before any
  implementation edit. Stop for independent POST-WORK scope review and explicit
  human commit approval before committing.

authoritative_baseline_commit: 97fcada

contract_clarification_gate:
  required_before_implementation: true
  question: >
    §1.6 of the frozen M2 contract (docs/architecture/ixid-onboarding-v0.1.md)
    describes continueUrl as "optionally continueUrl" and states mismatches are
    "silently ignored." The Slice F implementation requires exactly one continueUrl
    matching ALLOWED_CONTINUE_URL and fails closed if absent or mismatched. Before
    any implementation edit, determine:
    (a) Whether the frozen contract's "optional" language was intentional or
        imprecise shorthand for "present when ActionCodeSettings.url is set."
    (b) Whether the stricter implementation is an acceptable conformant
        interpretation or requires a contract amendment.
  resolution_record: >
    The PRE-WORK scope-sentinel report is the authoritative lane clarification
    record for this determination. No separate evidence file is authorized or
    required. The sentinel must state one of:
    CLARIFICATION: NO AMENDMENT REQUIRED — stricter implementation conforms to
    contract intent; proceed with implementation.
    CLARIFICATION: AMENDMENT REQUIRED — stop; surface as PROPOSED_DOCTRINE_CHANGE
    and obtain explicit human authorization before any implementation edit.
  failure_rule: >
    If the clarification determination is absent, ambiguous, or AMENDMENT REQUIRED,
    no implementation edit may occur. Return BLOCKER.

allowed_write_paths:
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
  - any edit to action.js — if required, classify as BLOCKER and stop
  - any new remote script origin, CDN load, CSP change, or external resource
    addition to action.html — if required, classify as BLOCKER and stop
  - any Firebase Auth mutation (creating users, enabling providers, changing
    project configuration, sending emails)
  - any GCP mutation
  - any deployment or publication
  - any networked test or call to Firebase, GCP, or any external service
  - any change to read-only paths
  - any change to doctrine files other than this exact human-applied transition
  - any package installation or dependency update
  - any other path outside allowed_write_paths and read_only_paths

acceptance_gates:
  - authoritative_baseline_commit (97fcada) is reachable and the dedicated
    one-file lane-transition commit is its direct child
  - doctrine_freshness passes at PRE-WORK, POST-WORK, and pre-commit review
  - contract_clarification_gate resolution is present in the PRE-WORK
    scope-sentinel report and is NO AMENDMENT REQUIRED before any implementation
    edit begins
  - independent PRE-WORK scope-sentinel returns GO with no BLOCKER
  - all read_only_paths are existing tracked regular files;
    action-adapter.test.js does not yet exist and will be created by this lane
  - implementation makes no edit outside allowed_write_paths
  - action.js is unchanged from 97fcada through commit
  - no new remote script origin, CSP change, or external resource appears in
    action.html
  - existing frontend-contract.test.js suite passes: 20 tests, 0 failures,
    unchanged from Slice F
  - node ixid-onboarding-web/tests/action-adapter.test.js passes all authorized
    adapter-boundary cases with zero failures, covering: verifyEmail success,
    resetPassword success, invalid mode, missing/invalid oobCode, invalid/missing
    continueUrl, Firebase rejection (applyActionCode throws), and
    Firebase rejection (confirmPasswordReset throws)
  - git diff --check passes for all changed paths
  - no networked call, Firebase mutation, GCP mutation, or deployment occurred
  - independent POST-WORK scope-sentinel returns GO with no BLOCKER
  - explicit human commit approval received before committing

explicitly_out_of_scope:
  - action.js changes of any kind
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
