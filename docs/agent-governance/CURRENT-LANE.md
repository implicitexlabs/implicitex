lane_id: m2-activation-phases-2-5
status: ACTIVE

# CURRENT-LANE.md — M2 Production Activation: Phases 2–5
# =========================================================
# Continuation of M2 production activation. Phase 1 is COMPLETE.
# This lane covers Phases 2–5 only.
#
# Human authorization: 2026-08-24. Explicit instruction:
# "Open a continuation lane for IX Id M2 production activation,
# covering Phases 2–5 only."
#
# CURRENT-LANE.md is fail-closed (I-1). If this file is missing, malformed,
# internally contradictory, or does not authorize the requested work,
# scope-sentinel must return BLOCKED. No best-effort interpretation permitted.

objective: >
  Complete M2 production activation at app.ixid.me. Phase 1 is already
  complete. Phases 2–5 deploy the M2 frontend, apply protection gates,
  enable onboarding, and prove the flow end-to-end with the committed
  smoke runbook.

authoritative_baseline_commit: 5d5995ccc2dd598e809f195c43cb0d497559a179

# ─────────────────────────────────────────────────────────────────────────
# PHASE 1 — ALREADY COMPLETE (DO NOT REDO)
# ─────────────────────────────────────────────────────────────────────────
phase_1_record:
  status: COMPLETE
  evidence:
    - ixid-holder-authority revision 00004-dnm serving 100% production traffic
    - image: gcr.io/ixid-prod/ixid-holder-authority:d2e64a7ef4f1f16cdad90cd64e6e897aac83bf71
    - email_verified enforcement: require_email_verified=True on CREATE_ACCOUNT
      (handler line 191) and REGISTER_IX_ID (handler line 253); absent from
      GET /workspace (line 298) — correct per contract §1.5
    - 79/79 tests PASS including M2 email_verified admission tests (4/4)
    - rollback available: ixid-holder-authority-00003-n7k

# ─────────────────────────────────────────────────────────────────────────
# INFRASTRUCTURE ALREADY LIVE — MUST NOT RECREATE
# ─────────────────────────────────────────────────────────────────────────
live_infrastructure:
  - ixid-onboarding-web-neg (Serverless NEG, created 2026-08-22)
  - ixid-onboarding-web-backend (Backend service, wired to NEG and URL map)
  - app.ixid.me host rule in ixid-url-map (fingerprint zbQgsLPSsRQ= prior; now zbQgsLPSsRQ→current)
  - DNS: app.ixid.me → 8.232.10.66
  - TLS: *.ixid.me, Google Trust Services

# ─────────────────────────────────────────────────────────────────────────
# EXECUTION RUNBOOK REFERENCE
# ─────────────────────────────────────────────────────────────────────────
runbook:
  commit: 19cbeb6
  path: docs/operations/ixid-m2-activation-smoke-runbook.md
  authority: >
    This lane references the committed runbook for smoke probe structure
    and evidence format. The runbook itself confers no execution authority;
    this CURRENT-LANE.md is the execution authority.

# ─────────────────────────────────────────────────────────────────────────
# AUTHORIZED EXECUTION SEQUENCE
# ─────────────────────────────────────────────────────────────────────────

phase_2_frontend_dark_deploy:
  description: >
    Build and deploy new ixid-onboarding-web revision from current HEAD
    (5d5995c). The deployed image (ixid-onboarding-web-00001-5pc, built
    from c73e2df) is the Slice A placeholder. HEAD contains the complete
    M2 state machine (Slices E–G). Keep onboarding disabled (config.js
    enabled flag must remain false for this phase).
  authorized_mutations:
    - docker build from ixid-onboarding-web/ (using Dockerfile in that dir)
    - push to us-central1-docker.pkg.dev/ixid-prod/ixid-onboarding-web/ixid-onboarding-web:<HEAD-sha>
    - gcloud run deploy ixid-onboarding-web new revision
    - traffic migration to new revision
  must_not:
    - modify config.js (remains disabled in this phase)
    - modify any source files in ixid-onboarding-web/public/
    - recreate NEG, backend service, or URL map
  acceptance:
    - https://app.ixid.me/ does NOT contain "Slice A" placeholder text
    - https://app.ixid.me/auth/action returns 200
    - https://app.ixid.me/config.js returns 200 (not 404)
    - onboarding state machine is NOT yet active (enabled gate holds)

phase_3_protection_gates:
  description: >
    Verify/apply required production protection from the runbook.
    Cloud Armor (§8.2) requires a security policy attached to the load
    balancer. If GCP quota permits creation, create and attach it now.
    If quota is still blocked (Slice D issue), record the status and
    document as a gate that human must unblock before Phase 4.
    Then STOP for required human Firebase Console checks.
  authorized_mutations:
    - gcloud compute security-policies create (if quota permits)
    - gcloud compute security-policies rules create (four rate-limit rules per §8.2)
    - gcloud compute backend-services update ixid-onboarding-web-backend --security-policy
  stop_condition: >
    After Cloud Armor attempt, STOP and report:
    1. Cloud Armor status (APPLIED or BLOCKED with reason)
    2. Request human to check Firebase Console and confirm:
       - app.ixid.me is authorized domain
       - custom action URL = https://app.ixid.me/auth/action
       - email/password provider state (should be DISABLED)
    Do not proceed to Phase 4 until human confirms Firebase state.
  cloud_armor_rate_limits:
    # Per contract §8.2
    - path: /api/holder/v0.1/account (POST)
      per_ip: 10 requests per hour
    - path: /api/holder/v0.1/ix-id (POST)
      per_ip: 20 requests per hour
    - path: /api/holder/v0.1/workspace (GET)
      per_ip: 120 requests per hour
    - path: /api/holder/* (other)
      per_ip: 200 requests per hour

phase_4_enablement:
  description: >
    Enable the onboarding state machine. Exactly one code change:
    config.js enabled flag false → true. Rebuild and redeploy.
    Firebase email/password enablement is the final gate — STOP and
    hand off to human.
  precondition: Human has confirmed Firebase Console state from Phase 3.
  authorized_code_change:
    file: ixid-onboarding-web/public/config.js
    change: enabled flag false → true
    constraint: ONLY this change. No other file modification permitted.
  authorized_mutations:
    - commit the config.js change (one commit, changed path: ixid-onboarding-web/public/config.js only)
    - docker build + push + deploy new ixid-onboarding-web revision
  stop_condition: >
    After config deploy, STOP and report readiness for Firebase enablement.
    Human performs Firebase Console action: enable email/password provider.
    This is the FINAL activation gate. Do not simulate or bypass.

phase_5_smoke_proof:
  description: >
    Execute the production smoke runbook at 19cbeb6. Record exact evidence.
    Follow the runbook structure for S2-1 through S2-4 and post-smoke
    neutralization.
  precondition: Human has enabled Firebase email/password provider.
  smoke_probes:
    - S2-1: Unverified-user denial — 401 AUTH_TOKEN_CLAIMS_INVALID, zero Firestore writes
    - S2-2: Full forward path with 409 probe — sign-up → verify → account → handle → ACTIVE
    - S2-3: Returning-user reconstruction — sign out, sign in, workspace without re-registration
    - S2-4: Force-refresh token workspace check — getIdToken(forceRefresh=true) → GET /workspace 200
  fail_closed: >
    If any probe fails: immediately disable Firebase email/password provider.
    Preserve all evidence. Do not delete Firestore records. Stop.
  post_smoke:
    - Disable Firebase user m2-smoke@ixid.me + revoke refresh tokens
    - Record evidence in docs/operations/evidence/m2-smoke-2026-08-24.md

# ─────────────────────────────────────────────────────────────────────────
# WRITABLE CODE PATHS
# ─────────────────────────────────────────────────────────────────────────
allowed_write_paths:
  - ixid-onboarding-web/public/config.js  # Phase 4 only: enabled flag flip

# Phase 5 may also create:
#   docs/operations/evidence/m2-smoke-2026-08-24.md  (evidence record)

# ─────────────────────────────────────────────────────────────────────────
# READ-ONLY PATHS
# ─────────────────────────────────────────────────────────────────────────
read_only_paths:
  - ixid-onboarding-web/Dockerfile
  - ixid-onboarding-web/nginx.conf
  - ixid-onboarding-web/public/config.js
  - ixid-onboarding-web/public/action.js
  - ixid-onboarding-web/public/action.html
  - ixid-onboarding-web/public/action-adapter.js
  - ixid-onboarding-web/public/firebase-auth-adapter.js
  - ixid-onboarding-web/public/onboarding-core.js
  - ixid-onboarding-web/public/register.js
  - ixid-onboarding-web/public/holder-api-client.js
  - docs/operations/ixid-m2-activation-smoke-runbook.md
  - docs/architecture/ixid-onboarding-v0.1.md
  - services/ixid_holder_authority_handler.py
  - services/ixid_holder_authority_service.py
  - infra/ixid-onboarding-web/deploy-slice-a.sh

# ─────────────────────────────────────────────────────────────────────────
# ROLLBACK
# ─────────────────────────────────────────────────────────────────────────
rollback:
  onboarding_web: >
    gcloud run services update-traffic ixid-onboarding-web
    --to-revisions=ixid-onboarding-web-00001-5pc=100 --region=us-central1
    --project=ixid-prod
  holder_authority: >
    gcloud run services update-traffic ixid-holder-authority
    --to-revisions=ixid-holder-authority-00003-n7k=100 --region=us-central1
    --project=ixid-prod
  firebase: >
    Disable Firebase email/password provider in Firebase Console immediately
    on any Phase 5 probe failure.
  firestore_smoke_records: PRESERVE — do not delete.

# ─────────────────────────────────────────────────────────────────────────
# EXPLICITLY NOT AUTHORIZED
# ─────────────────────────────────────────────────────────────────────────
not_authorized:
  - Wallet connection / Slice H — FOLLOW-ON
  - Slice F forensic record — FOLLOW-ON
  - URL map modification — infrastructure already live
  - NEG or backend service creation — already live
  - holder-authority rebuild (Phase 1 complete; only rebuild if failure forces recovery)
  - any Coin Card / app-web source changes
  - any deployment outside ixid-prod project

# ─────────────────────────────────────────────────────────────────────────
# ACCEPTANCE GATES
# ─────────────────────────────────────────────────────────────────────────
acceptance_gates:
  - PRE-WORK scope-sentinel returns GO before Phase 2 begins
  - Phase 2: app.ixid.me no longer serves Slice A placeholder; /config.js 200
  - Phase 3: Cloud Armor state documented; Firebase Console confirmed by human
  - Phase 4: config.js changed and deployed; Firebase email/password enabled by human
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
