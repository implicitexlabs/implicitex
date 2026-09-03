# IX ID — Production Readiness Checklist

**Meaningful go-live test:** Sign in → get IX ID → connect wallet → receive USDC

Last updated: 2026-08-26 (cleanup pass)

---

## Account (Registration and authentication)

| Item | Status | Notes |
|---|---|---|
| Registration SPA UI complete | ✅ Done | All panels: auth, verification, pending, handle, workspace, denied |
| Email verification flow | ✅ Done | action.js + action-adapter.js; continueUrl fixed this session |
| Handle selection and claim | ✅ Done | 3–30 chars, validation, idempotent server claim |
| Backend APIs | ✅ Done | CREATE_ACCOUNT, REGISTER_IX_ID, GET_WORKSPACE (Holder Authority M1 live) |
| app.ixid.me URL routing | ✅ Done | Slice B2 URL map live (ixid-url-map-post-b2-baseline.yaml) |
| Registration SPA deployed | ✅ Done | ixid-onboarding-web Cloud Run service live |
| Firebase config populated | ❌ **Blocked** | config.js has `enabled: false`, `options: null`. Requires Firebase web config values from ixid-prod Firebase project + redeploy |
| Password reset flow | ✅ Done | action.js + action-adapter.js |
| Legal and help pages | ✅ Done | Canonical location: ixid.me/about, /help, /privacy, /terms. App footer links there. Files live in ixid-identity-page/public/. Attorney review pending on Terms. |

**Activation step (Firebase config):**
1. In Firebase console for ixid-prod project, get the Web app SDK config values (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId)
2. Update `ixid-onboarding-web/public/config.js`: set `enabled: true`, populate `firebase.options` with the values
3. Build and deploy: `docker build` + `gcloud run deploy ixid-onboarding-web`

---

## Identity (IX ID address and public page)

| Item | Status | Notes |
|---|---|---|
| *.ixid.me wildcard ingress | ✅ Done | Live since 2026-08-18; wildcard cert active |
| Public identity page | ✅ Done | 37/37 tests; shows domain claim |
| ixid.me landing page | ✅ Done | Home page with correct identity-not-address language; About page added |
| Handle registry (Firestore) | ✅ Done | ix_ids collection, append-only events |
| Domain verification service | ✅ Done | DNS TXT challenge, scheduler, projection kernel |
| Profile fields (display_name, bio, avatar, banner) | ❌ Not implemented | Schema defined; no API endpoint or UI yet |
| Domain verification UI | ❌ Not implemented | Server service exists; no user-facing flow |
| Public profile showing non-domain fields | ❌ Not implemented | Only DOMAIN claim displayed; PAYMENT_ROUTE deferred |

---

## Route (Wallet and payment route)

| Item | Status | Notes |
|---|---|---|
| Wallet connection UI | ✅ Done | EIP-1193 connector; MetaMask on Polygon mainnet (chain 137) |
| Wallet address display | ✅ Done (this session) | Truncated display + Polygon label; full address in title attribute |
| Wallet address persisted to Firestore | ❌ **Not implemented** | Wallet connects client-side only; address not saved server-side |
| Wallet ownership verification | ❌ Not implemented | M3 spec exists (DRAFT, needs review); no challenge/sign flow |
| Payment route record | ❌ Not implemented | No `wallet_binding_events` records created; route state machine not built |
| Payment route read endpoint | ❌ Not implemented | No `/api/public/payment-route/{ix_id}` endpoint |
| Public identity page shows wallet/route | ❌ Blocked by route | Waiting for M3 |

---

## Payment (Receiving USDC)

| Item | Status | Notes |
|---|---|---|
| Payment CTA on public IX ID page | ❌ Not implemented | Needs route endpoint + UI to construct payment intent |
| Payment intent construction | ❌ Not implemented | IX ID resolves handle → wallet address → builds intent |
| ImplicitEx Transfer Portal integration | ❌ Not implemented | Handoff from IX ID to ImplicitEx payment flow not wired |
| Payment confirmation / receipt | ❌ Not implemented | Depends on payment flow existing |
| Fee display (1% ImplicitEx fee) | ❌ Not implemented | Fee logic exists in ImplicitEx; not surfaced in IX ID flow |

---

## Infrastructure

| Item | Status | Notes |
|---|---|---|
| *.ixid.me wildcard cert | ✅ Live | Expires 2026-11-17; auto-renewed |
| Global LB URL map | ✅ Live | Slice B2 routing active |
| ixid-public-web (identity page) | ✅ Live | |
| ixid-public-edge + ixid-projection | ✅ Live | 211/211 backend tests |
| ixid-holder-authority + ixid-holder-edge | ✅ Live | M1 closed |
| ixid-onboarding-web | ✅ Deployed | Dark until Firebase config activated |
| ixid-scheduler | ✅ Deployed | Hourly expire/repair, daily recheck |
| Cloud Armor (WAF) | ❌ **Blocked** | GCP quota at 0; self-service failed; support case submitted. Do not block unrelated development. |

---

## Go-live critical path

**To complete "Sign in → get IX ID":**
1. Activate Firebase config in `config.js` (see Account section above)
2. Deploy updated `ixid-onboarding-web`

**To complete "connect wallet → receive USDC":**
1. Implement M3 payment route:
   - Server-side wallet ownership verification (challenge + ecrecover)
   - `wallet_binding_events` Firestore records
   - Payment route read endpoint `/api/public/payment-route/{ix_id}`
2. Build payment UI on public identity page:
   - Fetch and display active route
   - Construct payment intent with amount input
   - Hand intent to ImplicitEx Transfer Portal or direct wallet interaction
3. Wire the ImplicitEx/IX ID handoff

**Cloud Armor is NOT on the critical path** for the go-live functional test. It is a security hardening measure. The service is accessible and operational without it. Activate after Google resolves the quota.

---

## Test status

| Suite | Count | Status |
|---|---|---|
| ixid-identity-page tests | 37 | ✅ 37/37 |
| onboarding action-adapter tests | 12 | ✅ 12/12 |
| onboarding adapter tests | 5 | ✅ 5/5 |
| onboarding frontend-contract tests | 22 | ✅ 22/22 |
| onboarding core state machine tests | 16 | ✅ 16/16 |
| onboarding wallet-connector tests | 22 | ✅ 22/22 |
| backend Python tests (Firestore emulator) | 211 | ✅ 211/211 |
| **Total** | **325** | **✅ 325/325** |

Note on frontend-contract count: went from 19 (pre-session) → 26 (after session 1) → 22 (after cleanup pass). The 4-test decrease removed content-verification tests for help/privacy/terms pages that moved to ixid-identity-page/public/ (where they belong as static HTML, not as SPA contract tests). Replaced by one structural test verifying correct domain separation (files at ixid.me, not app.ixid.me).
