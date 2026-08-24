lane_id: m2-slice-g-action-adapter-integration
status: ACTIVE
amendment: 3

# CURRENT-LANE.md — Authoritative execution boundary
# ====================================================
# Amendment 3 (2026-08-24): formalizes handling of pre-existing outside
# dirty-work manifest. Classifies 10 modified tracked files and 56
# untracked files as PRE-EXISTING / provenance-only. These paths predate
# the Slice G lane (mechanically verified: zero Slice G commits touch any
# outside path between aaf8347..HEAD). No outside path is authorized,
# adopted, read, staged, cleaned, restored, or attributed to Slice G.
# Amendment 2 commit: 3438b27; this amendment parent: 3438b27.
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
lane_amendment_1: aaf8347
lane_amendment_2: ea0cf5c
lane_amendment_3_parent: 3438b27

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
  status: RESOLVED — PATH A SELECTED (human authorization 2026-08-24)
  resolution: >
    action-adapter.js implements the three methods using the Firebase Auth
    REST API via fetch(). No Firebase SDK instance, no new remote script
    origin, no CSP change, no package install required.
    identitytoolkit.googleapis.com is already in action.html connect-src.
    The Web API key is read from the IXID_ONBOARDING_CONFIG already
    exposed by config.js (loaded before action-adapter.js in action.html).
    Tests mock fetch() — zero real network calls during test execution.
  authorized_rest_contract:
    base_url: https://identitytoolkit.googleapis.com/v1
    key_source: IXID_ONBOARDING_CONFIG.firebase.options.apiKey (from config.js)
    endpoints:
      applyActionCode:
        method: POST
        path: /accounts:update
        request_body: '{ "oobCode": "<oobCode>" }'
      verifyPasswordResetCode:
        method: POST
        path: /accounts:resetPassword
        request_body: '{ "oobCode": "<oobCode>" }'
        note: >
          Do not add requestType field. Response contains requestType in
          the success body; action-adapter.js need only confirm HTTP 200.
      confirmPasswordReset:
        method: POST
        path: /accounts:resetPassword
        request_body: '{ "oobCode": "<oobCode>", "newPassword": "<newPassword>" }'
    error_normalization: >
      Normalize all Firebase REST failures to a thrown Error with a safe
      message. Do not expose raw response bodies, API URLs containing the
      key, oobCode, passwords, or backend error payloads to logs, console
      output, or user-visible diagnostics. The adapter surface throws on
      failure; callers (action.js) observe only a thrown Error.
    secret_boundary: >
      The API key is a configuration value, not a secret, and may appear
      in the query string per Firebase's documented usage pattern. However,
      it must not be logged or surfaced in error output. The oobCode and
      newPassword must never appear in fetch URLs, logged output, error
      messages, or DOM content.
  failure_rule: >
    If implementation discovers that fetch(), IXID_ONBOARDING_CONFIG, or
    the existing connect-src cannot satisfy any of the three methods, return
    BLOCKER and stop for another amendment.

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

pre_existing_outside_manifest:
  classification: PRE-EXISTING / provenance-only
  predation_evidence: >
    Mechanically verified: git log aaf8347..HEAD with explicit pathspecs
    covering every outside path returned zero results. No Slice G governance
    commit (aaf8347, ea0cf5c, 3438b27) or implementation action touched
    any outside path. These entries were present and stable at PRE-WORK
    (confirmed by Amendment 2 PRE-WORK sentinel report) and remained
    stable through implementation.
  authority: >
    These paths grant zero read authority. Their contents remain unopened
    unless independently required and separately authorized by a future lane.
    They may not be staged, cleaned, restored, deleted, modified, or included
    in the Slice G commit under any circumstances.
  stability_requirement: >
    POST-WORK review must confirm the outside path/status set exactly matches
    the manifest below. If any outside path has appeared, disappeared, changed
    status, or been staged since PRE-WORK, return BLOCKER — OUTSIDE MANIFEST
    UNSTABLE rather than treating the change as harmless.
  modified_tracked_files:
    - " M app-web/backend/functions/index.js"
    - " M app-web/docs/product/coin-card/COIN_CARD_ARCHITECTURE_INDEX.md"
    - " M app-web/docs/product/coin-card/COIN_CARD_SIGNED_MANIFEST_ENVELOPE_AND_LIFECYCLE_CONTRACT_V1.md"
    - " M app-web/docs/product/coin-card/README.md"
    - " M app-web/package.json"
    - " M coincard/public/claim/index.html"
    - " M docs/product/coin-card/COIN_CARD_INVARIANT_CONTRACT.md"
    - " M docs/product/coin-card/COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md"
    - " M docs/product/coin-card/README.md"
    - " M firebase.json"
  untracked_files:
    - "?? app-web/backend/functions/scripts/deploy-gate1a-staging.js"
    - "?? app-web/backend/functions/src/spikes/SPIKES_ARE_DISPOSABLE.md"
    - "?? app-web/backend/functions/src/spikes/coincard-registry-read-spike.js"
    - "?? app-web/backend/functions/test/staging-deploy-wrapper.test.js"
    - "?? app-web/backend/scripts/spikes/hosting-rewrite/HOSTING_REWRITE_EVIDENCE.md"
    - "?? app-web/backend/scripts/spikes/hosting-rewrite/emulator-firestore.rules"
    - "?? app-web/backend/scripts/spikes/hosting-rewrite/emulator-storage.rules"
    - "?? app-web/backend/scripts/spikes/hosting-rewrite/package-lock.json"
    - "?? app-web/backend/scripts/spikes/hosting-rewrite/package.json"
    - "?? app-web/backend/scripts/spikes/hosting-rewrite/seed-fixtures.js"
    - "?? app-web/backend/scripts/spikes/hosting-rewrite/verify.js"
    - "?? app-web/backend/scripts/spikes/kms-p256-compatibility/KMS_COMPATIBILITY_EVIDENCE.md"
    - "?? app-web/backend/scripts/spikes/kms-p256-compatibility/spike.test.js"
    - "?? app-web/docs/product/coin-card/COIN_CARD_ARTIFACT_V1.md"
    - "?? app-web/docs/product/coin-card/COIN_CARD_BACKEND_ARCHITECTURE_V1.md"
    - "?? app-web/docs/product/coin-card/COIN_CARD_COMMERCIAL_SPEC_V1.md"
    - "?? app-web/docs/product/coin-card/COIN_CARD_ENGINEERING_IMPLEMENTATION_RULES_V1.md"
    - "?? app-web/docs/product/coin-card/COIN_CARD_PURCHASE_PROVISIONING_ARCHITECTURE_V1.md"
    - "?? app-web/docs/product/coin-card/legal/PRIVACY_POLICY_UPDATES.md"
    - "?? app-web/docs/product/coin-card/legal/PURCHASE_TERMS.md"
    - "?? app-web/docs/product/coin-card/legal/REFUND_POLICY.md"
    - "?? app-web/docs/product/coin-card/legal/TERMS_OF_SERVICE_UPDATES.md"
    - "?? app-web/tests/frontend/coin-card-artifact-builder.test.js"
    - "?? app-web/tests/frontend/coin-card-artifact-publication.test.js"
    - "?? app-web/tests/frontend/coin-card-artifact-validation.test.js"
    - "?? app-web/tests/frontend/coin-card-production-identity-migration.test.js"
    - "?? docs/blockaid-review-packet/ImplicitEx_Architecture_and_Security_Overview_v0.1.md"
    - "?? docs/operations/evidence/coin-card-antoine-migration-transport-preflight-2026-08-09.json"
    - "?? docs/operations/evidence/coin-card-antoine-production-identity-allocation-2026-08-09.json"
    - "?? docs/operations/evidence/coin-card-iron-fiat-routing/README.md"
    - "?? docs/operations/evidence/coin-card-rail-unit-economics/README.md"
    - "?? docs/product/coin-card/COIN_CARD_IRON_FIAT_ROUTING_ARCHITECTURE_V1.md"
    - "?? docs/product/coin-card/COIN_CARD_PUBLIC_IDENTITY_AND_LEGACY_MIGRATION_V1.md"
    - "?? docs/product/coin-card/COIN_CARD_PUBLIC_REGISTRY_SOURCE_CONTRACT_V1.md"
    - "?? docs/product/coin-card/COIN_CARD_PUBLIC_USERNAME_REGISTRY_CONTRACT_V1.md"
    - "?? docs/product/coin-card/COIN_CARD_PUBLIC_USERNAME_REGISTRY_CURRENT_HEAD_CONTRACT_V1.md"
    - "?? docs/product/coin-card/coin-card.artifact.fixtures.v1.json"
    - "?? docs/product/coin-card/coin-card.artifact.negative-corpus.v1.json"
    - "?? docs/product/coin-card/coin-card.artifact.schema.v1.json"
    - "?? docs/product/coin-card/fiat-routing/COIN_CARD_MULTI_RAIL_PRODUCT_AND_ECONOMICS_STRATEGY_2026-08-08.md"
    - "?? docs/product/coin-card/fiat-routing/COIN_CARD_RAIL_UNIT_ECONOMICS_MATRIX_V1.md"
    - "?? docs/product/coin-card/fiat-routing/IRON_COIN_CARD_FIAT_RAIL_DILIGENCE_MASTER_V1.md"
    - "?? docs/product/coin-card/fiat-routing/IRON_PROVIDER_DILIGENCE_QUESTIONNAIRE_V1.md"
    - "?? docs/product/coin-card/fiat-routing/IRON_PROVIDER_VALIDATION_MATRIX_V1.md"
    - "?? docs/product/coin-card/fiat-routing/MOONPAY_AND_IRON_PROVIDER_EVALUATION_2026-08-08.md"
    - "?? firebase.routing-spike.json"
    - "?? tools/coin-card-artifact/build-and-publish-artifact.js"
    - "?? tools/coin-card-artifact/build-artifact.js"
    - "?? tools/coin-card-artifact/canonicalize.js"
    - "?? tools/coin-card-artifact/generate-fixtures.js"
    - "?? tools/coin-card-artifact/in-memory-publication-store.js"
    - "?? tools/coin-card-artifact/publication-operation-fingerprint.js"
    - "?? tools/coin-card-artifact/publish-artifact.js"
    - "?? tools/coin-card-artifact/validate-artifact.js"
    - "?? tools/coin-card-artifact/validate-lineage.js"

acceptance_gates:
  - authoritative_baseline_commit (97fcada) is reachable; the original lane
    transition (aaf8347) and all amendments are in its ancestry; this
    amendment (Amendment 3) is the direct parent of any Slice G commit
  - doctrine_freshness passes at PRE-WORK, POST-WORK, and pre-commit review
  - contract_clarification status is RESOLVED — NO AMENDMENT REQUIRED
    (established in prior PRE-WORK; confirmed in this PRE-WORK review)
  - local_resource_dependency_gate status is RESOLVED (Path A, REST API,
    human-authorized 2026-08-24); PRE-WORK confirms dependency chain is
    within existing permitted resource model
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
