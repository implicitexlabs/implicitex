# IX ID M2 Production Activation and Smoke Runbook

**Contract authority:** `docs/architecture/ixid-onboarding-v0.1.md` — Revision 6 (`1a9fbf2`)
**Runbook authored:** 2026-08-24
**Lane:** `m2-activation-smoke-runbook-authoring` (`adaddd8`)

---

## TERMINAL SECTION — Execution authority disclaimer

**This runbook authorizes documentation only. Its presence confers zero execution
authority. Production execution of any step in this runbook requires an explicit
human-authorized execution lane whose `CURRENT-LANE.md` names this runbook and
each specific step authorized.**

This disclaimer is repeated at the end of the document.

---

## Section A — Prerequisite / stop-condition matrix

**Execution is STOP unless every row shows GO. Evaluate every row independently
before beginning any activation step. Do not proceed with a partial GO set.**

| # | Prerequisite | Source authority | Status |
|---|---|---|---|
| A-1 | Cloud Armor security policy attached to `ixid-holder-backend` and verified active on `/api/holder/*` paths (§8.2) | `ixid-onboarding-v0.1.md` §8.2; `ixid-url-map-holder-amendment.yaml` (backend name) | **BLOCKED** — Slice D GCP quota |
| A-2 | `ixid-onboarding-web` deployed to Cloud Run and action page reachable at `https://app.ixid.me/auth/action` (HTTP 200) | `ixid-onboarding-v0.1.md` §1.8 step 3 | Verify at execution time |
| A-3 | Firebase authorized-domain confirmed: `app.ixid.me` present in Authentication → Authorized domains | `ixid-onboarding-v0.1.md` §1.8 step 4 | Verify at execution time — see §C |
| A-4 | Firebase custom action URL confirmed: `https://app.ixid.me/auth/action` | `ixid-onboarding-v0.1.md` §1.8 step 4 | Verify at execution time — see §C |
| A-5 | `continueUrl` proven: a real generated Firebase action link inspected and contains `continueUrl=https%3A%2F%2Fapp.ixid.me%2Fregister` | `ixid-onboarding-v0.1.md` §1.6 (`actionContinueUrl: 'https://app.ixid.me/register'` per `config.js:11`) | CONTRACT_GAP — see §C |
| A-6 | Production Web API key confirmed present: `IXID_ONBOARDING_CONFIG.firebase.options.apiKey` is a non-null string in the deployed `config.js` at `app.ixid.me` | `config.js:8–16` (current value: `firebase.options: null` — must be populated before activation) | Verify at execution time |
| A-7 | Regression gate satisfied — §1.8 step 6 ("The M2 gate tests pass (§13)") — see §B | `ixid-onboarding-v0.1.md` §1.8 step 6, Part 13 | Verify at execution time — see §B |
| A-8 | Smoke mailbox confirmed: `m2-smoke@ixid.me` is a controlled, deliverable address capable of receiving email from `noreply@ixid-prod.firebaseapp.com` (or the configured sender domain) | `ixid-onboarding-v0.1.md` §12.1.1 | Verify at execution time |
| A-9 | Firebase email/password provider confirmed **DISABLED** at runbook open | `ixid-onboarding-v0.1.md` §1.8 step 7 ordering | Verify in Firebase Console |
| A-10 | Explicit human execution authorization exists for this specific run | Governance requirement (I-1) | Required before any step |

> **A-1 is currently BLOCKED.** Execution cannot begin until the GCP quota for Cloud Armor
> is granted (Slice D) and A-1 is verified. All other prerequisites may be verified in
> parallel while A-1 is blocked, but no activation step may proceed until A-1 is GO.

---

## Section B — Regression gate (§1.8 step 6)

**Contract wording (exact):** "The M2 gate tests pass (§13)."
*(Source: `docs/architecture/ixid-onboarding-v0.1.md`:1046)*

The M2 gate tests (Part 13, tests M2-1 through M2-11) must pass. They are in addition
to the M1 gate tests. Classification of each test command:

### B-1. M2 client test suite — LOCAL/STATIC

**Classification:** LOCAL/STATIC — runs against mocks/stubs, no production state read or mutated.

**Precondition:** Node.js ≥ 18 available. Working directory: `implicitex/`.

**Procedure:**
```
cd ixid-onboarding-web
npm test
```
*(Source: `ixid-onboarding-web/package.json` scripts.test — expands to:*
*`npm run check && node tests/onboarding-core.test.js && node tests/adapters.test.js && node tests/frontend-contract.test.js`)*

**Expected result:** All tests pass, zero failures.
- `onboarding-core.test.js` — 16 tests covering M2-3 through M2-10 behavioral invariants (email_verified gate, returning-user path, SUSPENDED/DISABLED account states, 409/422 distinction, idempotency, rate-limit message)
- `adapters.test.js` — 5 tests covering Firebase adapter configuration and Holder API client contract
- `frontend-contract.test.js` — 20 tests covering full contract against onboarding state machine

**Evidence to retain:** Full terminal output. Record: test counts, pass count, fail count, any skip count.

**Failure/stop condition:** Any test failure stops this gate. Do not proceed to §B-2 or any
activation step until the failure is diagnosed and the full suite is green.

**Next authorized step:** §B-2.

---

### B-2. Action-adapter test suite — LOCAL/STATIC

**Classification:** LOCAL/STATIC — uses mocked fetch, zero network calls.

**Precondition:** §B-1 passed.

**Procedure:**
```
cd ixid-onboarding-web
node tests/action-adapter.test.js
```
*(Source: `ixid-onboarding-web/package.json` — note: this file is NOT included in*
*`npm test`; it must be invoked separately)*

**Expected result:** 12/12 tests pass.
Tests cover: `applyActionCode` success/rejection; `verifyPasswordResetCode` success/rejection
(security gate: password form never shown on rejection); `confirmPasswordReset` success/rejection;
invalid mode; missing/empty/whitespace `oobCode`; missing/mismatched `continueUrl`; no secret leakage.

**Evidence to retain:** Full terminal output showing 12 passing, 0 failing.

**Failure/stop condition:** Any failure stops. Do not proceed to §B-3.

**Next authorized step:** §B-3.

---

### B-3. M1 gate tests — LOCAL/STATIC (Python service suite)

**Classification:** LOCAL/STATIC — runs against Firestore emulator.

**Precondition:** §B-2 passed. Firestore emulator available.

**Procedure:**
CONTRACT_GAP — The M2 contract Part 13 states "They are in addition to the M1 gate
tests (which remain the authority for M1 invariants)" but does not specify the M1 gate
test invocation command. No authorized read_only_path demonstrates the exact pytest
invocation or which services/ test files constitute the M1 gate.

> **CONTRACT_GAP B-3:** Determine the exact M1 gate test invocation (directory, command,
> emulator startup requirements, expected pass count) from the M1 authority contract
> (`docs/architecture/ixid-holder-authority-v0.1.md`) or from the person who ran the
> M1 gate at close. The M1 production evidence (`docs/operations/evidence/ixid-holder-authority-m1-production-state-2026-08-20.md`)
> records a final result of 319 passed / 1 skipped but does not record the invocation command.
> Resolve before execution.

**Expected result:** All M1 gate tests pass. Zero unexpected failures or skips.

**Evidence to retain:** Full terminal output, pass/skip/fail counts.

**Failure/stop condition:** Any M1 gate failure stops the regression gate. Do not proceed to §B-4.

**Next authorized step:** §B-4.

---

### B-4. M2-11 Cloud Armor rate-limit test — PRODUCTION-MUTATING

**Classification:** PRODUCTION-MUTATING — requires Cloud Armor attached and active;
generates real HTTP traffic to production endpoint; consumes quota against rate-limit counters.

**Precondition:** A-1 (Cloud Armor attached and verified), §B-3 passed, production endpoint reachable.

**Procedure:**
CONTRACT_GAP — The contract (§1.8 Part 13 M2-11) requires:

> "From one controlled source IP, exceed the configured 10 requests/hour threshold for
> `POST /api/holder/v0.1/account`. Confirm that Cloud Armor begins returning HTTP 429
> under sustained above-threshold traffic, confirm attribution to the account rate-limit
> rule, and confirm the client displays the rate-limit message."
> *(Source: `docs/architecture/ixid-onboarding-v0.1.md`:1084–1089)*

No authorized read_only_path demonstrates the exact procedure for: generating controlled
above-threshold traffic from a single source IP, confirming Cloud Armor rule attribution
(vs. application-level rejection), or verifying client display of the rate-limit message.

> **CONTRACT_GAP B-4:** Determine the exact M2-11 procedure before execution. Key decisions required:
> (1) Tool/command for generating controlled traffic from one source IP to `POST https://app.ixid.me/api/holder/v0.1/account` at above-threshold rate.
> (2) Method to confirm Cloud Armor attribution (Cloud Armor logs vs. response headers vs. GCP console).
> (3) Whether Firebase email/password must be enabled for this test (to obtain a valid token) or whether an invalid/unverified token is sufficient to exercise the rate limiter (Cloud Armor is pre-auth per §8.2: "Cloud Armor does not decrypt or verify Firebase bearer tokens").
>
> The contract notes rate-limit enforcement is approximate; no exact request number is required.

**Expected result:** Cloud Armor returns HTTP 429 from the source IP after threshold is exceeded.
*(Source: `docs/architecture/ixid-onboarding-v0.1.md`:1084–1089)*

**Evidence to retain:** HTTP responses showing 429 with Cloud Armor attribution.

**Failure/stop condition:** 429 not observed within reasonable traffic volume, or attribution
unclear. Do not proceed to §C until M2-11 is resolved or a human decision is made to
document the gap and proceed with explicit authorization.

**Next authorized step:** §C.

---

## Section C — Firebase step-4 verification

*(§1.8 step 4: "Firebase authorized-domain configuration updated: app.ixid.me added to
Authentication → Authorized domains. Custom action URL set to https://app.ixid.me/auth/action.")*
*(Source: `docs/architecture/ixid-onboarding-v0.1.md`:356–358)*

**Precondition:** §B (full regression gate) passed.

**Procedure — C-1: Authorized domain verification:**

CONTRACT_GAP — No authorized read_only_path demonstrates a programmatic command to
verify Firebase authorized domain configuration.

> **CONTRACT_GAP C-1:** The verification procedure for "app.ixid.me present in
> Authentication → Authorized domains" is Firebase Console UI inspection or a Firebase
> Management REST API call. No gcloud or firebase CLI command for this check appears
> in any authorized source. Candidate (unverified — requires CONTRACT_GAP resolution
> before execution):
> ```
> # Unverified candidate — do not use as authoritative
> gcloud firebase projects:list  # does not show authorized domains
> ```
> Resolve by: Firebase Console → ixid-prod → Authentication → Settings → Authorized
> domains tab, or consult Firebase Management API documentation.

**Expected result:** `app.ixid.me` appears in the authorized domains list.

**Evidence to retain:** Screenshot of Firebase Console authorized domains list or API response.

---

**Procedure — C-2: Custom action URL verification:**

CONTRACT_GAP — No authorized read_only_path demonstrates a command to verify the
Firebase custom action URL configuration.

> **CONTRACT_GAP C-2:** The verification procedure for "Custom action URL set to
> https://app.ixid.me/auth/action" is Firebase Console UI inspection (Authentication →
> Templates → Email address verification → Customize action URL). No programmatic
> verification command appears in any authorized source.

**Expected result:** Custom action URL field shows `https://app.ixid.me/auth/action`.

**Evidence to retain:** Screenshot of Firebase Console email template action URL setting.

---

**Procedure — C-3: `continueUrl` end-to-end verification:**

CONTRACT_GAP — This verification requires generating a real Firebase action link and
inspecting its query parameters to confirm `continueUrl` is preserved.

The contract requires (`ixid-onboarding-v0.1.md` §1.6):
- `ActionCodeSettings.url` set to `https://app.ixid.me/register`
- `continueUrl` parameter must be present and match `https://app.ixid.me/register`
- The action handler (`action.js`) validates `continueUrl` against `ALLOWED_CONTINUE_URL`
  which is `config.js:actionContinueUrl` = `https://app.ixid.me/register`

> **CONTRACT_GAP C-3:** Generating and inspecting a real Firebase action link to verify
> `continueUrl` requires either: (a) triggering a Firebase verification email and
> inspecting the link, which requires Firebase email/password to be enabled (step 7,
> not yet reached), or (b) using the Firebase Admin SDK to generate an action link
> directly. No authorized source demonstrates procedure (b). Resolve the sequencing
> question: can `continueUrl` be verified before step 7, or is this a post-enablement
> verification that runs during smoke (S2-2 email verification step)?

**Expected result:** Action link URL contains `continueUrl=https%3A%2F%2Fapp.ixid.me%2Fregister`.

**Evidence to retain:** Inspected action link URL (redact `oobCode`).

**Failure/stop condition:** Any C-1, C-2, or C-3 mismatch stops. Do not proceed to §D.
CONTRACT_GAP items must be resolved before execution.

**Next authorized step:** §D.

---

## Section D — Provider enablement (§1.8 step 7)

*(§1.8 step 7: "← ENABLE Firebase email/password here (the registration surface opens)")*
*(Source: `docs/architecture/ixid-onboarding-v0.1.md`:365)*

**Precondition:**

All of the following must be GO before this step:
- A-1 (Cloud Armor verified)
- A-2 (onboarding-web deployed and reachable)
- A-3 and A-4 (Firebase step-4 configuration confirmed)
- A-5 (continueUrl verified — or CONTRACT_GAP C-3 resolved with explicit authorization)
- A-6 (production Web API key populated in deployed config.js)
- A-7 (full regression gate §B passed)
- A-8 (smoke mailbox confirmed)
- A-9 (email/password provider confirmed DISABLED immediately before this step)
- A-10 (explicit human execution authorization)

**Procedure:** Human action in Firebase Console:
`ixid-prod → Authentication → Sign-in method → Email/Password → Enable`

> This is a HUMAN-ONLY gate. No automated command substitutes for this step.
> The moment email/password is enabled, the registration surface opens to the public.
> Proceed immediately to §E (smoke probes) after enablement — do not pause.
> *(Source: `docs/architecture/ixid-onboarding-v0.1.md`:367 "Immediately execute the authorized production smoke")*

**Expected result:** Firebase email/password provider status: Enabled.

**Evidence to retain:** Screenshot of Firebase Console sign-in providers showing
Email/Password: Enabled, with timestamp.

**Failure/stop condition:** If enablement fails or any pre-condition is not satisfied,
do NOT attempt to enable. Report and stop.

**Fail-closed rule (§1.8):** If any smoke probe (§E) fails after enablement, immediately
disable Firebase email/password again. See §G for the full rollback procedure.

**Next authorized step:** §E (immediately — no pause).

---

## Section E — S2 smoke probes (§12.1.2)

**Contract reference:** `docs/architecture/ixid-onboarding-v0.1.md`:994–1031

**Precondition:** §D (Firebase email/password enabled). All A-1 through A-10 prerequisites GO.

**Identity and handle (§12.1.1):**
```
Firebase identity: m2-smoke@ixid.me
IX ID handle:      m2-smoke
```
*(Source: `docs/architecture/ixid-onboarding-v0.1.md`:978–979)*

These are permanent production records after creation. The handle `m2-smoke` is never
recycled or deleted. *(Source: `docs/architecture/ixid-onboarding-v0.1.md`:990)*

**Token acquisition for API probes:**

CONTRACT_GAP — The smoke probes require a valid Firebase ID token for API calls. No
authorized read_only_path demonstrates how to obtain a Firebase ID token for manual
probe use outside the web UI.

> **CONTRACT_GAP E-token:** Determine token acquisition method:
> (a) Web UI sign-up at `https://app.ixid.me/register` (extracts token from browser
>     dev tools network tab or `firebase.auth().currentUser.getIdToken()`), or
> (b) Firebase Auth REST API `identitytoolkit.googleapis.com/v1/accounts:signInWithPassword`
>     (not demonstrated in authorized sources for this use).
> Resolve before execution. All API probes below assume a valid Firebase ID token is available.

**Request structure** *(derived from `ixid-onboarding-web/public/holder-api-client.js`:35–57 and `docs/architecture/ixid-onboarding-v0.1.md`:Part 2)*:
- Auth header: `Authorization: Bearer <firebase-id-token>`
- POST bodies: `Content-Type: application/json`
- No cookies sent (`credentials: 'omit'` per `holder-api-client.js`:45)
- Cache bypassed (`cache: 'no-store'` per `holder-api-client.js`:44)

---

### S2-1 — Unverified sign-up denial

*(Source: `docs/architecture/ixid-onboarding-v0.1.md`:997–1000)*

**Precondition:** Firebase email/password enabled (§D). `m2-smoke@ixid.me` does NOT
yet exist as a Firebase Auth user. Email has NOT been verified.

**Procedure:**
1. Register `m2-smoke@ixid.me` with a password via the onboarding UI at
   `https://app.ixid.me/register`. Do not click the verification link.
2. Obtain the unverified Firebase ID token for `m2-smoke@ixid.me`.
3. Attempt `CREATE_ACCOUNT`:
   ```
   curl -si -X POST https://app.ixid.me/api/holder/v0.1/account \
     -H "Authorization: Bearer <unverified-firebase-id-token>" \
     -H "Content-Type: application/json" \
     -d '{"operation_id":"<uuid-1>"}'
   ```
   *(Route source: `docs/architecture/ixid-onboarding-v0.1.md`:394–403)*

**Expected result:**
- HTTP 401
- `cache-control: no-store` header present
- Zero Firestore writes (confirm: no `accounts` document created for this identity)
  *(Source: `docs/architecture/ixid-onboarding-v0.1.md`:998–1000)*

**Evidence to retain:** Full HTTP response (status line, headers, body). Confirmation of
zero Firestore writes (Firestore Console or GCP logs).

**Failure/stop condition:** Any result other than 401 fails this probe. Execute §G
(fail-closed rollback) immediately. Do not proceed to S2-2.

**Next authorized step:** S2-2.

---

### S2-2 — Full forward path including 409 probe

*(Source: `docs/architecture/ixid-onboarding-v0.1.md`:1002–1021)*

**Precondition:** S2-1 passed. `m2-smoke@ixid.me` Firebase account exists but email
is unverified.

**Procedure:**

**Step S2-2a — Email verification:**
Open the Firebase verification email sent to `m2-smoke@ixid.me`. Click the verification
link, which must direct to `https://app.ixid.me/auth/action` with `mode=verifyEmail`.
The action handler processes `applyActionCode(oobCode)` and redirects to
`https://app.ixid.me/register` (the `continueUrl`).
*(Source: `docs/architecture/ixid-onboarding-v0.1.md`:1003)*

**Step S2-2b — Token refresh (confirm verified):**
Obtain a force-refreshed Firebase ID token for `m2-smoke@ixid.me`.
The token's `email_verified` claim must be `true`.
*(Source: `docs/architecture/ixid-onboarding-v0.1.md`:1004: "reload() + getIdToken(forceRefresh: true) → email_verified = true confirmed")*

**Step S2-2c — CREATE_ACCOUNT:**
```
curl -si -X POST https://app.ixid.me/api/holder/v0.1/account \
  -H "Authorization: Bearer <verified-firebase-id-token>" \
  -H "Content-Type: application/json" \
  -d '{"operation_id":"<uuid-2>"}'
```
Expected: **HTTP 201**. Body: `{"account_id": "...", "account_state": "ACTIVE", "account_state_version": 0, "owned_ix_id": null}`.
`cache-control: no-store` header present.
*(Route source: `docs/architecture/ixid-onboarding-v0.1.md`:394–403)*

**Step S2-2d — 409 probe (HANDLE_UNAVAILABLE on taken handle):**

> **ORDERING CONSTRAINT (contract-verbatim):** "This probe must occur BEFORE 'm2-smoke'
> is claimed. An account that already owns 'm2-smoke' receives 409 on any second IX ID
> registration attempt (F-12 one-ID sentinel), which would make a post-claim black-box
> probe ambiguous — it could be confirming F-12 rather than the taken-handle path."
> *(Source: `docs/architecture/ixid-onboarding-v0.1.md`:1011–1016)*

```
curl -si -X POST https://app.ixid.me/api/holder/v0.1/ix-id \
  -H "Authorization: Bearer <verified-firebase-id-token>" \
  -H "Content-Type: application/json" \
  -d '{"operation_id":"<uuid-3>","handle":"m1-smoke-test"}'
```
Expected: **HTTP 409** `HANDLE_UNAVAILABLE`. Zero Firestore writes for this IX ID.
*(Source: `docs/architecture/ixid-onboarding-v0.1.md`:1007–1010 — `m1-smoke-test` is the
permanent M1 smoke IX ID committed at `d5841d1`, production Firestore record permanent)*

> Note: A server-reserved handle returns 422 `HANDLE_RESERVED`, not 409. Only an
> existing Firestore IX ID record satisfies this probe.
> *(Source: `docs/architecture/ixid-onboarding-v0.1.md`:1015–1016)*

**Step S2-2e — REGISTER_IX_ID "m2-smoke":**

Use a **fresh `operation_id`** (not uuid-3).
*(Source: `docs/architecture/ixid-onboarding-v0.1.md`:1017 "Use a fresh operation_id for the next call")*

```
curl -si -X POST https://app.ixid.me/api/holder/v0.1/ix-id \
  -H "Authorization: Bearer <verified-firebase-id-token>" \
  -H "Content-Type: application/json" \
  -d '{"operation_id":"<uuid-4>","handle":"m2-smoke"}'
```
*(Route source: `docs/architecture/ixid-onboarding-v0.1.md`:405–413)*

Expected: **HTTP 201**. Body: `{"ix_id": "...", "ix_id_state": "ACTIVE", ...}`.
`cache-control: no-store` header present.

**Step S2-2f — GET /workspace:**
```
curl -si https://app.ixid.me/api/holder/v0.1/workspace \
  -H "Authorization: Bearer <verified-firebase-id-token>"
```
*(Route source: `docs/architecture/ixid-onboarding-v0.1.md`:415–419)*

Expected: **HTTP 200**. Body: `{"account_state": "ACTIVE", ..., "ix_ids": [...]}` where
`ix_ids` contains the registered `"m2-smoke"` IX ID entry.
`cache-control: no-store` header present on all three responses (CREATE_ACCOUNT, REGISTER_IX_ID, GET /workspace).
*(Source: `docs/architecture/ixid-onboarding-v0.1.md`:1021)*

**Evidence to retain:** Full HTTP responses for all steps (S2-2a through S2-2f): status
lines, headers, bodies. Token `email_verified` claim confirmation. 409 response confirming
`HANDLE_UNAVAILABLE` for `m1-smoke-test`. 201 response for `m2-smoke`.

**Failure/stop condition:** Any step deviating from the expected result fails S2-2. Execute
§G immediately. Do not proceed to S2-3.

**Next authorized step:** S2-3.

---

### S2-3 — Returning-user path

*(Source: `docs/architecture/ixid-onboarding-v0.1.md`:1023–1025)*

**Precondition:** S2-2 passed. `m2-smoke@ixid.me` account is ACTIVE and owns `m2-smoke`.

**Procedure:**
1. Sign out of the `m2-smoke@ixid.me` Firebase session.
2. Sign back in as `m2-smoke@ixid.me` (Firebase email/password).
3. Obtain a fresh Firebase ID token.
4. `GET /workspace`:
   ```
   curl -si https://app.ixid.me/api/holder/v0.1/workspace \
     -H "Authorization: Bearer <fresh-signed-in-token>"
   ```

**Expected result:** **HTTP 200**. Body: `ix_ids` is populated (contains `m2-smoke` IX ID
entry, non-empty). Account state: ACTIVE. No handle selection required.
*(Source: `docs/architecture/ixid-onboarding-v0.1.md`:1025 "GET /workspace → 200 with owned IX ID populated (no handle selection)")*

**Evidence to retain:** Full HTTP response, body confirming `ix_ids` non-empty and
containing `m2-smoke`.

**Failure/stop condition:** Any result other than 200 with non-empty `ix_ids` fails S2-3.
Execute §G immediately.

**Next authorized step:** S2-4.

---

### S2-4 — Workspace readable after verification

*(Source: `docs/architecture/ixid-onboarding-v0.1.md`:1027–1031)*

**Precondition:** S2-3 passed.

**Procedure:**
1. Obtain a force-refreshed Firebase ID token for `m2-smoke@ixid.me` (`getIdToken(forceRefresh: true)`).
2. `GET /workspace` with the fresh token:
   ```
   curl -si https://app.ixid.me/api/holder/v0.1/workspace \
     -H "Authorization: Bearer <force-refreshed-token>"
   ```

**Expected result:** **HTTP 200**. Workspace readable. No re-verification required.
*(Source: `docs/architecture/ixid-onboarding-v0.1.md`:1030 "GET /workspace with force-refreshed token → 200. Workspace readable.")*

**Evidence to retain:** Full HTTP response confirming 200 and readable workspace body.

**Failure/stop condition:** Any result other than 200 fails S2-4. Execute §G immediately.

**Next authorized step:** §F (post-smoke neutralization) — all four probes have passed.

---

## Section F — Post-smoke neutralization

*(Source: `docs/architecture/ixid-onboarding-v0.1.md`:1033–1039)*

**Precondition:** All four probes S2-1 through S2-4 passed.

**Procedure:**

**Step F-1 — Disable Firebase user:**

CONTRACT_GAP — Disable `m2-smoke@ixid.me` Firebase user by setting `disabled: true`.

> **CONTRACT_GAP F-1:** The contract requires `disabled: true` on the Firebase Auth user
> `m2-smoke@ixid.me`. The M1 evidence document confirms the end-state (`disabled=true`
> confirmed via re-query) but does not record the exact Admin SDK command or Firebase
> Console procedure used to set it. Candidate (unverified — requires CONTRACT_GAP
> resolution before execution):
> - Firebase Admin SDK (Node.js): `admin.auth().updateUser(uid, { disabled: true })`
> - Firebase Console: Authentication → Users → m2-smoke@ixid.me → Disable account
>
> Resolve and document the exact procedure for this production operation before execution.

**Expected result:** `m2-smoke@ixid.me` Firebase Auth user has `disabled: true`.

---

**Step F-2 — Revoke refresh tokens (set `validSince`):**

CONTRACT_GAP — Set `validSince` to the current Unix timestamp to revoke refresh tokens.

> **CONTRACT_GAP F-2:** The contract requires `validSince` to be set to the current Unix
> timestamp. The M1 evidence records the result (`validSince: 1787253010` observed via
> re-query, `docs/operations/evidence/ixid-holder-authority-m1-production-state-2026-08-20.md`:215)
> but does not record the exact command that produced it. Firebase Admin SDK provides
> `revokeRefreshTokens(uid)` which updates `validSince` internally; or `updateUser(uid,
> { tokensValidAfterTime: new Date() })`. Candidate (unverified):
> - Firebase Admin SDK: `admin.auth().revokeRefreshTokens(uid)` followed by
>   `admin.auth().getUser(uid)` to obtain the resulting `tokensValidAfterTime` value.
>
> Resolve and document the exact procedure before execution.

**Expected result:** `validSince` is set to a Unix timestamp ≥ the token issuance time
during smoke. All previously-issued refresh tokens are invalidated; new ID tokens cannot
be issued.

---

**Step F-3 — Confirm both via re-query:**

CONTRACT_GAP — Confirm `disabled: true` and `validSince: <timestamp>` on `m2-smoke@ixid.me` via re-query.

> **CONTRACT_GAP F-3:** No authorized source demonstrates the exact re-query command.
> Candidate (unverified): `admin.auth().getUser(uid)` and inspect `disabled` and
> `tokensValidAfterTime` fields. Resolve before execution.

**Expected result:** Re-query confirms `disabled: true` and `validSince` is the timestamp
set in F-2.

**Evidence to retain:** Re-query output showing confirmed `disabled: true` and `validSince`
timestamp (format: Unix epoch seconds, as in M1 evidence).
*(Evidence format source: `docs/operations/evidence/ixid-holder-authority-m1-production-state-2026-08-20.md`:213–216)*

---

**Step F-4 — Record smoke evidence:**

Record smoke evidence following the M1 evidence document format.
*(Source: `docs/architecture/ixid-onboarding-v0.1.md`:1039; format reference:
`docs/operations/evidence/ixid-holder-authority-m1-production-state-2026-08-20.md`)*

Evidence document must include at minimum:
- Commit SHA at time of smoke (HEAD)
- Firebase Auth user created: `m2-smoke@ixid.me` — UID, creation timestamp, provider
- Firestore records created: `accounts` document (account_id), `ix_ids` document (`m2-smoke`)
- Probe table for S2-1 through S2-4: Expected | Observed | PASS for each
- Neutralization record: `disabled: true` confirmed, `validSince: <timestamp>` confirmed
- Timestamp of each step

**Path:** `docs/operations/evidence/m2-smoke-<date>.md`

---

**Permanent preservation requirement (§12.1.1):**

> "The Firestore authority records for the smoke identity and handle are preserved
> **permanently** as M2 smoke evidence. The handle `m2-smoke` is **never recycled
> or deleted.**"
> *(Source: `docs/architecture/ixid-onboarding-v0.1.md`:989–990)*

The following must NOT be performed after smoke:
- Deletion of the `m2-smoke` Firestore `ix_ids` document
- Deletion of the `accounts` document for `m2-smoke@ixid.me`
- Release or reassignment of the handle `m2-smoke`
- Deletion of the Firebase Auth user `m2-smoke@ixid.me`

Disabling the Firebase user (F-1) and revoking refresh tokens (F-2) are the only
authorized neutralization operations on the Firebase Auth side.

**Next authorized step:** M2 smoke complete. Lane closure governance commit.

---

## Section G — Fail-closed rollback

*(Source: `docs/architecture/ixid-onboarding-v0.1.md`:370–381)*

**Trigger:** Any of S2-1 through S2-4 fails.

**Procedure (contract-verbatim):**

> "If any of S2-1 through S2-4 fails:
> - Immediately disable Firebase email/password again.
> - Anonymous Firebase sign-in remains disabled.
> - Preserve all authority records and evidence already written to Firestore.
>   Do not attempt compensating Firestore deletion.
> - Capture the failed production state as an evidence document.
> - STOP. No further deployment steps. Review required before re-enabling."
>
> *(Source: `docs/architecture/ixid-onboarding-v0.1.md`:372–378)*

No steps beyond these four are authorized by the contract. Do not improvise forward.

**Evidence to retain:** Full evidence document of the failed state per the M1 evidence
format. Record: which probe failed, the exact HTTP response observed, the expected response,
all Firestore writes that occurred before failure.

**Re-enable condition:**

> "Only a completely passing production smoke (all probes S2-1 through S2-4 observed
> PASS) permits Firebase email/password to remain enabled."
> *(Source: `docs/architecture/ixid-onboarding-v0.1.md`:380–381)*

---

## CONTRACT_GAP summary

The following items must be resolved before execution. No contracted step may proceed
on an unresolved CONTRACT_GAP where the gap is on the critical path for that step.

| ID | Section | Description | Critical path |
|---|---|---|---|
| B-3 | §B-3 | M1 gate test exact invocation command | Before §C |
| B-4 | §B-4 | M2-11 Cloud Armor rate-limit test procedure | Before §C |
| C-1 | §C-1 | Firebase authorized-domain verification command | Before §D |
| C-2 | §C-2 | Firebase custom action URL verification command | Before §D |
| C-3 | §C-3 | `continueUrl` end-to-end verification procedure and sequencing | Before §D |
| E-token | §E | Firebase ID token acquisition procedure for API probes | Before S2-1 |
| F-1 | §F-1 | Firebase Admin command to set `disabled: true` on `m2-smoke@ixid.me` | Before lane closure |
| F-2 | §F-2 | Firebase Admin command to set `validSince` / revoke refresh tokens | Before lane closure |
| F-3 | §F-3 | Firebase Admin re-query command to confirm neutralization | Before lane closure |

---

## TERMINAL SECTION — Execution authority disclaimer

**This runbook authorizes documentation only. Its presence confers zero execution
authority. Production execution of any step in this runbook requires an explicit
human-authorized execution lane whose `CURRENT-LANE.md` names this runbook and
each specific step authorized.**

No activation step, smoke probe, Firebase mutation, GCP mutation, deployment, or
external-state change is authorized by this document. Reading this runbook does not
constitute authorization to execute any step within it.
