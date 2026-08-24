lane_id: m2-production-activation
status: ACTIVE

# CURRENT-LANE.md — M2 Production Activation
# ============================================
# Authorizes the activation of the completed M2 IX ID Onboarding flow
# at app.ixid.me. All code is complete (Slices E–G); this lane governs
# deployment, infrastructure enablement, and live smoke proof only.
#
# Human authorization: 2026-08-24. Explicit instruction: "Yes. Now open
# the activation lane." with sequencing: deploy holder-authority security
# gate first, then expose the new onboarding frontend.
#
# CURRENT-LANE.md is fail-closed (I-1). If this file is missing, malformed,
# internally contradictory, or does not authorize the requested work,
# scope-sentinel must return BLOCKED. No best-effort interpretation permitted.

objective: >
  Activate and prove the completed M2 onboarding flow so a real user can
  complete: sign up/sign in → email verification → create IX ID account
  → claim handle → ACTIVE workspace → returning-user reconstruction.
  app.ixid.me is reachable (DNS/TLS/NEG/backend/URL-map are live).
  The deployed Cloud Run revisions are stale and must be rebuilt from HEAD.

authoritative_baseline_commit: 1a1e33c47e67d7b182100f9e300ab2e3a40d6c76

# ─────────────────────────────────────────────────────────────────────────
# INFRASTRUCTURE ALREADY LIVE — DO NOT RECREATE
# ─────────────────────────────────────────────────────────────────────────
# These resources exist in production. Recreating them is NOT authorized.
#
# ixid-onboarding-web-neg      — Serverless NEG, created 2026-08-22
# ixid-onboarding-web-backend  — Backend service, wired to NEG + URL map
# app.ixid.me host rule        — live in ixid-url-map, fingerprint zbQgsLPSsRQ=
#   /* → ixid-onboarding-web-backend
#   /api/holder/* → ixid-holder-backend (rewrite /holder/)
#   /api/*        → ixid-edge-backend   (rewrite /)
# DNS: app.ixid.me → 8.232.10.66
# TLS: *.ixid.me, Google Trust Services
# ─────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────
# AUTHORIZED EXECUTION SEQUENCE
# ─────────────────────────────────────────────────────────────────────────

phases:

  phase_1_server_side_safety_gate:
    description: >
      Build and deploy a new ixid-holder-authority revision from HEAD.
      HEAD includes c08fb60 (email_verified enforcement) and e8c374b
      (corrective pass). Scope is already correct: require_email_verified=True
      on CREATE_ACCOUNT and REGISTER_IX_ID only; GET /workspace does not
      enforce email_verified (per contract §1.5). No code change required.
    authorized_mutations:
      - docker build from services/ with Dockerfile.holder_authority
      - push to gcr.io/ixid-prod/ixid-holder-authority:<HEAD-sha>
      - gcloud run deploy ixid-holder-authority new revision
    must_not:
      - modify ixid_holder_authority_handler.py
      - modify ixid_holder_authority_service.py
      - modify any service source file
    acceptance:
      - new revision is traffic-serving
      - verify_firebase_id_token call with email_verified:false → 401 AUTH_TOKEN_CLAIMS_INVALID
      - zero Firestore writes on denied requests (confirmed via logs or Firestore console)

  phase_2_frontend_dark_deploy:
    description: >
      Build and deploy new ixid-onboarding-web revision from HEAD (Slices E-G).
      The deployed image (c73e2df) is Slice A placeholder; HEAD contains the
      full M2 state machine. Keep onboarding DISABLED in config during this phase.
    authorized_mutations:
      - docker build from ixid-onboarding-web/ (Dockerfile in that dir)
      - push to us-central1-docker.pkg.dev/ixid-prod/ixid-onboarding-web/ixid-onboarding-web:<HEAD-sha>
      - gcloud run deploy ixid-onboarding-web new revision
    must_not:
      - change config.js enabled flag in this phase (remains false/absent)
      - modify any public/ source files
    acceptance:
      - https://app.ixid.me/ serves the new artifact (not Slice A placeholder text)
      - https://app.ixid.me/auth/action returns 200
      - https://app.ixid.me/config.js returns 200 (not 404)
      - onboarding state machine is NOT yet active (enabled gate holds)

  phase_3_infrastructure_gates:
    description: >
      Cloud Armor rate-limiting (required per contract §8.2 before enabling
      Firebase email/password). Firebase Console checks are MANUAL — do not
      assume their state; stop and report findings.
    authorized_mutations:
      - gcloud compute security-policies create (Cloud Armor policy)
      - gcloud compute security-policies rules create (four rate-limit rules per §8.2)
      - gcloud compute backend-services update ixid-onboarding-web-backend --security-policy
    manual_human_checks:
      - Firebase Console: is app.ixid.me an authorized domain?
      - Firebase Console: is custom action URL set to https://app.ixid.me/auth/action?
      - Firebase Console: is email/password provider currently enabled or disabled?
    stop_on: >
      Report Firebase Console findings. Do not proceed to Phase 4 until
      human confirms Firebase state and provides go-ahead.

  phase_4_enablement:
    description: >
      Enable the onboarding state machine. Requires exactly one code change:
      config.js enabled flag. Rebuild and redeploy frontend with that change.
      Firebase email/password enablement is the final gate — manual human action.
    authorized_code_change:
      - file: ixid-onboarding-web/public/config.js
        change: enabled flag false → true
        constraint: ONLY this change; no other file modification permitted
    authorized_mutations:
      - commit the config.js change (one commit, changed path: ixid-onboarding-web/public/config.js)
      - docker build + push + deploy new ixid-onboarding-web revision
    manual_human_gate:
      - Human enables Firebase email/password provider in Firebase Console
      - This is the FINAL activation gate; do not simulate or bypass
    stop_on: >
      After config deploy, stop and report readiness for Firebase enablement.
      Human performs Firebase Console action.

  phase_5_live_proof:
    description: >
      Execute production smoke test. Record exact evidence.
    smoke_probes:
      S2-1:
        name: Unverified-user denial
        steps: >
          Create Firebase email/password account. Before verifying email,
          attempt POST /api/holder/v0.1/account with unverified token.
          Expected: 401 AUTH_TOKEN_CLAIMS_INVALID. Zero Firestore writes.
      S2-2:
        name: Full forward path with 409 probe
        steps: >
          Verify email via action handler at https://app.ixid.me/auth/action.
          Create account (201). Attempt handle 'm1-smoke-test' (expect 409
          HANDLE_UNAVAILABLE — handle exists from M1 smoke). Claim 'm2-smoke'
          (201). GET /workspace (200, ix_ids contains 'm2-smoke').
          Cache-Control: no-store on all responses.
      S2-3:
        name: Returning-user reconstruction
        steps: >
          Sign out. Sign back in. GET /workspace without re-registration.
          Expected: 200, ACTIVE state, ix_ids = ['m2-smoke'].
      S2-4:
        name: Force-refresh token workspace check
        steps: >
          getIdToken(forceRefresh=true). GET /workspace with fresh token.
          Expected: 200.
    post_smoke:
      - Disable Firebase user m2-smoke@ixid.me + revoke refresh tokens
      - Record evidence in docs/operations/evidence/m2-smoke-<date>.md
    fail_closed: >
      If any probe fails: immediately disable Firebase email/password provider.
      Preserve all evidence. Do not delete Firestore records. Stop.

# ─────────────────────────────────────────────────────────────────────────
# WRITABLE CODE SET
# ─────────────────────────────────────────────────────────────────────────
allowed_write_paths:
  - ixid-onboarding-web/public/config.js   # Phase 4 only: enabled flag flip

# No other source file change is authorized.
# holder-authority source is correct as-is (email_verified scope confirmed).
# All other public/ files are deployed as-is from HEAD.

# ─────────────────────────────────────────────────────────────────────────
# MUST NOT MODIFY (in addition to I-2 doctrine files)
# ─────────────────────────────────────────────────────────────────────────
read_only_paths:
  - services/ixid_holder_authority_handler.py
  - services/ixid_holder_authority_service.py
  - services/Dockerfile.holder_authority
  - ixid-onboarding-web/public/action.js
  - ixid-onboarding-web/public/action.html
  - ixid-onboarding-web/public/action-adapter.js
  - ixid-onboarding-web/public/firebase-auth-adapter.js
  - ixid-onboarding-web/public/onboarding-core.js
  - ixid-onboarding-web/public/register.js
  - ixid-onboarding-web/Dockerfile
  - infra/ixid-onboarding-web/ixid-url-map-slice-b-candidate.yaml

# ─────────────────────────────────────────────────────────────────────────
# ROLLBACK PROCEDURE
# ─────────────────────────────────────────────────────────────────────────
rollback:
  holder_authority: >
    gcloud run services update-traffic ixid-holder-authority
    --to-revisions=ixid-holder-authority-00003-n7k=100 --region=us-central1
    --project=ixid-prod
  onboarding_web: >
    gcloud run services update-traffic ixid-onboarding-web
    --to-revisions=ixid-onboarding-web-00001-5pc=100 --region=us-central1
    --project=ixid-prod
  firebase: >
    Disable Firebase email/password provider in Firebase Console.
    Do NOT delete Firestore records created during smoke test.
  cloud_armor: >
    gcloud compute backend-services update ixid-onboarding-web-backend
    --no-security-policy --global --project=ixid-prod
  firestore_smoke_records: PRESERVE (not deleted per fail-closed rule)

# ─────────────────────────────────────────────────────────────────────────
# SCOPE CLASSIFICATION CONSTRAINTS
# ─────────────────────────────────────────────────────────────────────────
not_authorized:
  - Wallet connection (Slice H) — FOLLOW-ON
  - Slice F forensic record — FOLLOW-ON
  - URL map modification — infrastructure already live, not needed
  - NEG or backend service creation — already live, not needed
  - Any Coin Card / app-web changes
  - Any deployment to non-ixid-prod project

# ─────────────────────────────────────────────────────────────────────────
# ACCEPTANCE GATES
# ─────────────────────────────────────────────────────────────────────────
acceptance_gates:
  - Phase 1: new holder-authority revision serving; email_verified:false → 401 confirmed
  - Phase 2: app.ixid.me serves M2 artifact (not Slice A placeholder); config.js 200
  - Phase 3: Cloud Armor policy created and attached; Firebase Console state confirmed by human
  - Phase 4: onboarding enabled; Firebase email/password enabled by human
  - Phase 5: all four smoke probes PASS; evidence recorded; smoke user disabled

doctrine_freshness:
  reference_commit: 162eeb0a5ae4efeed0e208593321bad41dd259fe
  paths:
    - AGENTS.md
    - CLAUDE.md
    - .claude/agents/scope-sentinel.md
    - docs/agent-governance/CHARTER.md
    - docs/agent-governance/FROZEN-INVARIANTS.md

last_human_review: "2026-08-24"
  # Metadata only. Not freshness proof or authorization.
