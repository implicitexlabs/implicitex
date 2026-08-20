# IX ID Onboarding v0.1
## M2 Reconnaissance and Contract Design — Revision 2

Status: **DRAFT — awaiting independent review**
Milestone: M2 — IX ID Registration / Onboarding v0.1
Revision: 2 (Revision 1 checkpoint: `7cd4c44`, 2026-08-20)

Prerequisites: M1 — Holder Authority v0.1 (CLOSED at `d5841d1`, 2026-08-20)

---

## Purpose of this document

This document defines the M2 contract for the user-facing onboarding layer that
drives a visitor from an unauthenticated state to an ACTIVE account with one
registered IX ID handle.

The frozen M1 authority contract (`ixid-holder-authority-v0.1.md`) defines the
authority API. M2 defines:
- The additional admission rule the authority must enforce for M2 identities
- The client-side onboarding state machine
- The authentication method authorized for M2
- Error presentation, retry behavior, and abuse controls

**One M2 authority behavior change from M1:** The authority must check the
`email_verified` claim in the Firebase ID token before any `CREATE_ACCOUNT` or
`REGISTER_IX_ID` call. This is a stricter admission rule layered on top of
the frozen M1 token-verification step; it does not change M1's ownership model,
state machine, idempotency contracts, or schema. The frozen M1 architecture
document is not modified.

M2 does not authorize any other change to the authority service.

---

## Non-Goals (M2 explicit exclusions)

```
NO  changes to ixid-holder-authority-v0.1.md (frozen)
NO  changes to M1 API surface, routes, or response contracts
NO  changes to M1 ownership model, schema, state machines, or idempotency contracts
NO  payment execution or wallet binding
NO  DOMAIN verification
NO  PAYMENT_ROUTE creation
NO  profile customization (display_name, bio, logo)
NO  business verification
NO  account recovery (linking a new auth credential to an existing account_id)
NO  multiple IX IDs per account
NO  IX ID transfer or resale
NO  account closure (CLOSE_ACCOUNT)
NO  auth provider migration or revocation
NO  anonymous Firebase sign-in at any point
NO  Sign-In with Ethereum (SIWE) — deferred to wallet binding milestone
NO  ImplicitEx sender/payment integration
NO  preflight handle-availability endpoint or advisory read
NO  per-UID rate limiting at the holder edge
NO  disposable-email domain blocklist
NO  Firebase Dynamic Links (shut down 2025-08-25)
NO  production onboarding UI implementation (M2 is reconnaissance + contract design only)
```

---

## Part 1: Authentication Authorization

### 1.1 M1 smoke credential is not a product decision

The M1 smoke used Firebase email/password to obtain a Firebase ID token for the live
authority loop. Both Firebase providers were disabled at M1 closure. Neither was
authorized as a product authentication method by M1 — they were test infrastructure.

M2 is the document that makes the production authentication decision.

### 1.2 M2 authorized production authentication method

**Primary: Firebase email/password.**

Rationale:
- Named in the frozen M1 authority contract (§3.1) as the v0.1 auth mechanism.
- Firebase email/password produces a Firebase ID token that the M1 authority verifies
  via the Admin SDK — no additional authority verification changes required beyond §1.4.
- Email verification is natively supported and yields the `email_verified` claim in
  the Firebase ID token that the authority can enforce server-side (§1.4).

**Anonymous sign-in: remains disabled.** Anonymous accounts cannot serve as the
stable auth anchor for a persistent economic identity.

**Sign-In with Ethereum (SIWE): not in M2.** Wallet binding is defined in M3/M4.
SIWE requires a custom Firebase token flow architecturally separate from M2.

**Google OAuth and other social providers: not in M2.** Require separate authorization.

### 1.3 Firebase email/password configuration (resolved)

When email/password is enabled in ixid-prod, these configuration decisions apply:

| Setting | Value |
|---|---|
| Password minimum length | 12 characters |
| Email enumeration protection | Enabled (callers cannot determine whether an email is registered from error messages) |
| Action code / continue URL domain | `app.ixid.me` (see §1.5) |
| Dynamic Links | Not used (shut down 2025-08-25) |

### 1.4 M2 authority admission rule: server-side `email_verified` enforcement

**This is the M2 authority behavior change.**

For M2 email/password identities, after the authority has verified the Firebase ID
token (existing M1 behavior), the authority must additionally confirm that the
verified token's `email_verified` claim is `true`. An unverified credential must be
denied before any `CREATE_ACCOUNT` or `REGISTER_IX_ID` operation proceeds.

**Implementation:** `verify_firebase_id_token()` in the authority service must be
extended to inspect `email_verified` after successful token verification. If
`email_verified != true`, raise `AuthenticationError` with an internal reason code
of `EMAIL_NOT_VERIFIED`.

**External behavior:** 401 with error code `UNAUTHENTICATED`. The external response
is identical to any other authentication failure; the caller learns only that
authentication failed. The internal reason code is emitted as a structured log field
only; it is never returned to the client and never written to Firestore.

**Firestore writes on denial:** Zero. Same as all other `AuthenticationError` paths
in M1 (§5.5 denial evidence invariant).

**`emailVerified` vs `email_verified`:** Firebase's client SDK `User` object exposes
`user.emailVerified` (a JavaScript property). The Firebase ID token claim is
`email_verified` (a JWT claim). The authority reads the decoded token claim; it does
not trust the client-SDK property.

**Scope:** This check applies to `CREATE_ACCOUNT` and `REGISTER_IX_ID`. It does NOT
apply to `GET /workspace` — a returning user with an established account must be able
to read their workspace even if their email verification status has somehow changed.
`GET /workspace` retains M1's existing authentication gate (valid token, account found,
account not DISABLED/CLOSED).

**This check is not in the frozen M1 document because M1 used Firebase email/password
only for its smoke gate.** The M2 contract adds it as a downstream admission policy in
the same authority service. The M1 ownership model, state machine, schema, idempotency
contracts, and security rules are unchanged.

### 1.5 Firebase action code flow (email verification and password reset)

Firebase sends email verification and password-reset links. The link behavior is
governed by `ActionCodeSettings`:

```
ActionCodeSettings:
  url: "https://app.ixid.me/auth/action"   ← continue URL (app.ixid.me domain)
  handleCodeInApp: false                    ← verification handled in browser
                                              (no Dynamic Links; no app deeplink)
```

`handleCodeInApp: false` means Firebase opens a hosted page (served from
`app.ixid.me`) that processes the action code. The hosted page:
- Calls Firebase `applyActionCode()` or `confirmPasswordReset()` depending on mode.
- On success, prompts the user to continue to the onboarding flow.
- Does not depend on the verification being completed in the same browser tab or session.

After returning to the onboarding flow in any browser tab/session:
1. Client calls `user.reload()` to refresh the Firebase user object.
2. Client calls `user.getIdToken(forceRefresh: true)` to obtain a fresh ID token
   containing the updated `email_verified: true` claim.
3. Client evaluates the current onboarding state from the fresh token.

The flow must remain correct when verification is completed on a different device
or browser than the one used to sign up.

### 1.6 Password reset

Firebase's `sendPasswordResetEmail()` (with the same `ActionCodeSettings` as §1.5)
supports password reset for the same Firebase principal. This is:
- In scope for M2 as a standard account-security feature.
- Distinct from Holder Authority identity-link recovery, which adds a new auth
  credential to an existing `account_id`. That is explicitly out of scope for M2.
- A recovery of the Firebase principal only; the Holder Authority `account_id`,
  `auth_identities` entry, and `accounts` document are not affected.

The onboarding surface must include a "Forgot password?" link on the sign-in form
that initiates `sendPasswordResetEmail()`.

### 1.7 Provider enablement gate

Firebase email/password may only be enabled in ixid-prod when:

1. This Revision 2 M2 contract has completed independent review and is accepted.
2. The M2 authority `email_verified` check (§1.4) is implemented and gate-tested.
3. The Cloud Armor rate limiting policy (§8.2) is deployed before the route is live.
4. The `/api/holder/*` URL map rule is confirmed live in the production URL map.

**The provider must not be enabled before all four conditions are met.**

---

## Part 2: M1 API Reference (frozen)

The following routes are the only authority endpoints available to M2. They may
not be modified, extended, or bypassed.

```
POST /api/holder/v0.1/account
    Body: {"operation_id": "<uuid>"}
    Auth: Authorization: Bearer <firebase-id-token>
    201: {"account_id": "...", "account_state": "ACTIVE", "account_state_version": 0, "owned_ix_id": null}
    200: idempotent replay (account existed and is ACTIVE)
    401: token invalid | no account for identity | email_verified != true (M2 addition)
    422: MISSING_OPERATION_ID | IDEMPOTENCY_CONFLICT
    403: account SUSPENDED | DISABLED | CLOSED

POST /api/holder/v0.1/ix-id
    Body: {"operation_id": "<uuid>", "handle": "<desired-handle>"}
    Auth: Authorization: Bearer <firebase-id-token>
    201: {"ix_id": "...", "ix_id_state": "ACTIVE", "ix_id_state_version": 0, "owner_account_id": "..."}
    200: idempotent replay (IX ID already registered)
    401: token invalid | no account for identity | email_verified != true (M2 addition)
    409: HANDLE_UNAVAILABLE — handle taken or permanently reserved; caller cannot distinguish
    422: MISSING_OPERATION_ID | MISSING_HANDLE | HANDLE_INVALID | HANDLE_RESERVED
    403: account SUSPENDED | DISABLED | CLOSED

GET /api/holder/v0.1/workspace
    Auth: Authorization: Bearer <firebase-id-token>
    200: {"account_id": "...", "account_state": "...", "account_state_version": ..., "ix_ids": [...]}
    401: token invalid | no account for identity (email_verified check NOT applied here)
    403: account DISABLED | CLOSED

All responses: Cache-Control: no-store
```

**Note on 409 vs 422 for reserved handles:** `REGISTER_IX_ID` returns:
- `409 HANDLE_UNAVAILABLE` when the handle exists in Firestore in any state (ACTIVE,
  SUSPENDED, TOMBSTONED) — the caller cannot distinguish these states.
- `422 HANDLE_RESERVED` when the handle is on the server blocklist (§4.2 of M1) but
  does not exist as a Firestore document. These are two distinct denial paths.

Revision 1 incorrectly described 409 as also covering reserved handles. The
authoritative source is the frozen M1 contract §5.5.

### 2.1 Key authority behaviors M2 must accommodate

**`CREATE_ACCOUNT` returns 200 on idempotent replay.** Both 201 and 200 are success.

**`REGISTER_IX_ID` returns 200 on idempotent replay.** Both 201 and 200 are success.
The revision 7 idempotency ordering means a retry after a lost response returns 200
(not 409 HANDLE_UNAVAILABLE) if the first call committed.

**Idempotency keys are single-use per logical operation.** Generate a fresh UUID per
operation attempt. A `HANDLE_SELECTION` retry after a handle change requires a new UUID.

**`owned_ix_id` in idempotent-replay `CREATE_ACCOUNT` response reflects current state.**
After `REGISTER_IX_ID` succeeds, a replayed `CREATE_ACCOUNT` with the same `operation_id`
returns `owned_ix_id = "alice"`, not the `null` that existed at original creation.

---

## Part 3: User Journey Map

The complete forward path from unauthenticated visitor to ACTIVE account + ACTIVE IX ID,
with no interruptions.

```
Visitor arrives at onboarding surface (https://app.ixid.me/register or equivalent)
    │
    ▼
[UNAUTHENTICATED]
    No Firebase session.
    User provides email and password.
    New user: Firebase createUserWithEmailAndPassword()
    Existing user: Firebase signInWithEmailAndPassword()
    │
    │  (New user path continues here)
    ▼
[EMAIL_UNVERIFIED]
    Firebase session established; email_verified = false.
    No Holder Authority calls made.
    Client calls Firebase sendEmailVerification() with ActionCodeSettings (§1.5).
    Client shows: "Check your email to verify your address."
    User clicks verification link → Firebase processes action code.
    Client: user.reload() + user.getIdToken(forceRefresh: true)
    │
    ▼
[EMAIL_VERIFIED]
    Firebase session; email_verified = true.
    Client has fresh Firebase ID token containing email_verified: true.
    No Holder Authority call has been made yet.
    │
    ▼
[CREATE_ACCOUNT_PENDING]
    Client generates operation_id UUID.
    Client calls POST /api/holder/v0.1/account.
    201 → account created (new account; owned_ix_id = null)
    200 → account already existed (idempotent; check owned_ix_id in response)
    │
    ├─ owned_ix_id non-null → ACTIVE (onboarding already complete for this identity)
    │
    ▼
[HANDLE_SELECTION]
    Account ACTIVE; owned_ix_id = null.
    Client shows handle input with instant client-side format validation.
    No availability check endpoint. The claim operation is the availability gate.
    User types handle, sees canonicalized form (lowercase) live.
    User submits: client generates new operation_id UUID.
    Client calls POST /api/holder/v0.1/ix-id.
    │
    ├─ 201 or 200 → REGISTER_PENDING → success → ACTIVE
    ├─ 409 HANDLE_UNAVAILABLE → return to HANDLE_SELECTION (try another handle)
    └─ 422 HANDLE_RESERVED → return to HANDLE_SELECTION (reserved message)
    │
    ▼
[ACTIVE / HOLDER WORKSPACE]
    Account ACTIVE. IX ID ACTIVE.
    Client calls GET /api/holder/v0.1/workspace.
    Displays workspace (§7).
```

### 3.1 Strict invariant: no Holder Authority calls before email_verified = true

No call to `CREATE_ACCOUNT` or `REGISTER_IX_ID` is made while the Firebase session
has `email_verified = false`. The authority will deny these calls (§1.4), but the
client must not attempt them — unverified/bot Firebase signups must not produce any
Holder Authority state. The client gate is defense-in-depth; the authority gate is
the security boundary.

### 3.2 No placeholder accounts

The M1 authority is not called during the EMAIL_UNVERIFIED state. Unverified signups
leave no Holder Authority records.

---

## Part 4: Onboarding State Machine

Seven discrete states. Every named state in the machine is reachable and has an
unambiguous next required action.

### 4.1 UNAUTHENTICATED

**Condition:** No Firebase session.
**User sees:** Sign-in and sign-up forms. "Forgot password?" link.
**Next action:** Sign in (existing user) or sign up (new user).
**Exits to:**
- `EMAIL_UNVERIFIED` — new Firebase registration (email_verified = false)
- `EMAIL_VERIFIED` — sign-in where email already verified
- `CREATE_ACCOUNT_PENDING` — returning signed-in user path (§6)

### 4.2 EMAIL_UNVERIFIED

**Condition:** Firebase session; `email_verified = false`. No Holder Authority state.
**User sees:** "Check your email to verify your address. [email@example.com] [Resend]"
**Next action:** Find the verification email and click the link.
**Client actions:**
- Call `sendEmailVerification()` once on entering this state.
- Listen for Firebase auth state changes.
- On auth state change: call `user.reload()` then `user.getIdToken(forceRefresh: true)`.
- If `email_verified = true`: transition to EMAIL_VERIFIED.
- Offer one resend per 60 seconds (client-side throttle).
**No Holder Authority calls in this state.**
**Exits to:** `EMAIL_VERIFIED`, `UNAUTHENTICATED` (user signs out).

### 4.3 EMAIL_VERIFIED

**Condition:** Firebase session; `email_verified = true`; no account resolution attempted yet.
**User sees:** Transition indicator ("Setting up your account…").
**Next action:** None visible — client proceeds immediately.
**Client actions:** Generate `operation_id` UUID; call `CREATE_ACCOUNT`.
This state exists to make the machine explicit; it is visually transparent to the user.
**Exits to:** `CREATE_ACCOUNT_PENDING`.

### 4.4 CREATE_ACCOUNT_PENDING

**Condition:** `CREATE_ACCOUNT` call in flight.
**User sees:** Loading indicator ("Setting up your account…").
**On 201:** → `HANDLE_SELECTION` (new account; `owned_ix_id = null`).
**On 200:** Inspect response:
- `owned_ix_id = null` → `HANDLE_SELECTION` (account exists, no IX ID yet).
- `owned_ix_id` non-null → `ACTIVE` (onboarding already complete).
**On 401:** Force-refresh Firebase ID token and retry once. If still 401: → `UNAUTHENTICATED`
(auth failure; show sign-in form with "Session expired. Please sign in again.").
**On 403:** → `ACCESS_DENIED_ERROR`.
**On network error / timeout:** Retry with the same `operation_id` (§10.2).
**Exits to:** `HANDLE_SELECTION`, `ACTIVE`, `ACCESS_DENIED_ERROR`, `UNAUTHENTICATED`.

### 4.5 HANDLE_SELECTION

**Condition:** Account ACTIVE; `owned_ix_id = null`.
**User sees:** Handle input with live format validation. "Claim IX ID" submit button.
**Next action:** Type a handle and submit.
**Client actions:**
- Apply client-side format validation (§5.1) inline.
- Show canonicalized form (lowercase) live as the user types.
- On submit: generate new `operation_id` UUID; call `REGISTER_IX_ID`.
**On 201 or 200:** → `ACTIVE`.
**On 409 HANDLE_UNAVAILABLE:** Stay in `HANDLE_SELECTION`; show "That handle is not available."
**On 422 HANDLE_RESERVED:** Stay in `HANDLE_SELECTION`; show "That handle is reserved."
**On 422 HANDLE_INVALID or MISSING_HANDLE:** Format error (client-side check missed it); show specific message.
**On 403:** → `ACCESS_DENIED_ERROR`.
**On network error / timeout:** Retry with the same `operation_id` and same handle (§10.3).
**Exits to:** `ACTIVE`, `ACCESS_DENIED_ERROR`.

### 4.6 ACCESS_DENIED_ERROR

**Condition:** 403 from `CREATE_ACCOUNT` or `REGISTER_IX_ID`.
**User sees:** "Your account is not currently available. Contact support."
**Next action:** Contact support. No self-serve path in M2.
**Note:** 403 at `CREATE_ACCOUNT` for a newly registered user indicates an administrative
action (account pre-seeded as SUSPENDED/DISABLED). Not a normal path; do not suggest retry.

### 4.7 ACTIVE (Holder Workspace)

**Condition:** Account ACTIVE; IX ID ACTIVE (owned_ix_id non-null).
**User sees:** Holder workspace (§7).
**Next action:** None — onboarding complete.

---

## Part 5: Handle Selection

### 5.1 Client-side format validation

Applied immediately as the user types. Mirrors M1 §4.1 canonicalization.

```
1. Lowercase the input (canonicalize). Display the lowercased form live.
2. Reject length < 3 after canonicalization.
3. Reject length > 30 after canonicalization.
4. Reject any character not in [a-z0-9-].
5. Reject leading hyphen.
6. Reject trailing hyphen.
7. Reject consecutive hyphens (--).
```

| Violation | Inline message |
|---|---|
| Too short (< 3) | "At least 3 characters." |
| Too long (> 30) | "30 characters maximum." |
| Invalid character | "Letters, numbers, and hyphens only." |
| Leading hyphen | "Cannot start with a hyphen." |
| Trailing hyphen | "Cannot end with a hyphen." |
| Consecutive hyphens | "No consecutive hyphens." |

The submit button is disabled while any format error is present.

### 5.2 No preflight availability check

There is no advisory availability endpoint and no projection-based availability read.

**Rationale:** Any pre-claim read is non-authoritative. The atomic `REGISTER_IX_ID`
transaction is the only correct availability gate. A green "Available" signal based
on a pre-claim read would be a false guarantee; a caller can see "Available" and
receive 409 HANDLE_UNAVAILABLE because another session claimed the handle in the interval.

The handle input shows format validation feedback only. The submit button label is
"Claim IX ID" — not "Check availability" or "Register." The user submits to claim;
the authority responds with success (201/200) or denial (409/422).

This also eliminates any new data-authority read from the holder edge (which is
frozen at zero Firestore roles).

### 5.3 409 vs 422 presentation

| Response | Message |
|---|---|
| 409 HANDLE_UNAVAILABLE | "That handle is not available. Try another." |
| 422 HANDLE_RESERVED | "That handle is reserved and cannot be registered." |
| 422 HANDLE_INVALID | Per format-error table in §5.1 (client-side guard should catch first) |

The 409 message is identical whether the handle is ACTIVE, SUSPENDED, or TOMBSTONED.
The caller cannot distinguish these states, consistent with M1 §5.5.

---

## Part 6: Returning User Behavior

### 6.1 Account resolution at sign-in

When a returning user signs in with Firebase, the client reconstructs the current
onboarding state from the authority. The primary instrument is GET /workspace.

Before calling GET /workspace, call `user.getIdToken(forceRefresh: false)` to confirm
the token is current. (It will be fresh on a new sign-in.)

```
user.getIdToken()
    │
GET /api/holder/v0.1/workspace
    │
    ├─ 200, ix_ids non-empty → ACTIVE (complete; go to workspace)
    ├─ 200, ix_ids empty     → HANDLE_SELECTION (account exists, no IX ID)
    ├─ 401                   → Account may not exist, or token issue (§6.2)
    └─ 403                   → ACCESS_DENIED_ERROR
```

### 6.2 Workspace 401 handling

401 from GET /workspace means either (a) no account exists for this Firebase identity,
or (b) the Firebase ID token is invalid or expired. The client must not assume 401
uniquely means "no account."

Protocol on 401 from GET /workspace:

```
1. Call user.getIdToken(forceRefresh: true).
2. Retry GET /api/holder/v0.1/workspace with fresh token.

   On 200: Resolve state from response (§6.1).

   On 401 again: No account exists for this verified identity.
       email_verified = true: → EMAIL_VERIFIED (will call CREATE_ACCOUNT)
       email_verified = false: → EMAIL_UNVERIFIED
       (Note: if user is signed in and email is not verified, re-enter email verification flow)
```

**Do not encode "workspace 401 = no account" as an invariant.** The token-refresh
retry is mandatory.

### 6.3 Account state on return

| GET /workspace result | Action |
|---|---|
| 200, `ix_ids` non-empty | → ACTIVE (workspace) |
| 200, `ix_ids` empty | → HANDLE_SELECTION |
| 200, `account_state = SUSPENDED` | → Suspended workspace view (§6.4) |
| 401 (after retry) | → EMAIL_VERIFIED or EMAIL_UNVERIFIED per §6.2 |
| 403 | → ACCESS_DENIED_ERROR |

### 6.4 Suspended account

`account_state = SUSPENDED` in the GET /workspace 200 response:

**User sees:** Workspace with a suspended-account banner: "Your account is under review.
Handle registration is unavailable." The existing IX IDs are displayed read-only.

**Client must not show `HANDLE_SELECTION`** or call `REGISTER_IX_ID` for a SUSPENDED
account. The authority returns 403 for `REGISTER_IX_ID` on SUSPENDED accounts; the
client gate is defense-in-depth.

---

## Part 7: Authenticated Workspace

### 7.1 Minimum workspace display

| Data | Display |
|---|---|
| `ix_ids[0].ix_id` | "Your IX ID: @alice" |
| `account_state` | Show banner only if not ACTIVE |
| `account_state_version`, `ix_id_state_version` | Not displayed to user (internal) |

### 7.2 What is not in the M2 workspace

M2 workspace does not display or construct:
- Payment routing information (no PAYMENT_ROUTE claim exists)
- Wallet binding status (no claim exists)
- Verification claim status (no claims in M2)
- Public identity page link (separate milestone)

### 7.3 Firebase session management

The Firebase SDK manages ID token refresh automatically using the refresh token.
The client uses the Firebase auth state listener exclusively; it does not store or
manage raw ID tokens. Firebase ID tokens must not be written to localStorage.

---

## Part 8: Abuse Controls

### 8.1 email_verified as namespace admission gate

The M2 authority check (§1.4) requires a verified Firebase email before any account
or IX ID is created. This raises the cost of namespace claiming to the cost of
receiving a verified email, while keeping unverified signups entirely out of the
Holder Authority.

The residual threat is automated account creation with disposable addresses that
can receive verification emails. §8.3 addresses the rate-limiting dimension of this.

### 8.2 Rate limiting — Cloud Armor (resolved)

Rate limiting in M2 v0.1 is implemented via a Cloud Armor security policy attached
to the global load balancer, applied at the path level.

**Cloud Armor does not decrypt or verify Firebase bearer tokens.** Rate limiting is
per source IP and per path only. Per-UID (per-account) rate limiting would require
the Firebase UID to be available before authority verification — which contradicts the
frozen M1 invariant that only the authority performs Firebase token verification.
Per-UID limiting is therefore deferred to a future milestone where it can be placed
correctly after the verification boundary.

Recommended Cloud Armor limits:

| Path | Per-IP limit | Window |
|---|---|---|
| `POST /api/holder/v0.1/account` | 10 requests | 1 hour |
| `POST /api/holder/v0.1/ix-id` | 20 requests | 1 hour |
| `GET /api/holder/v0.1/workspace` | 120 requests | 1 hour |
| `/api/holder/*` (global) | 200 requests | 1 hour |

These limits are recommendations subject to operational adjustment. Cloud Armor
policies are configurable without a code deploy.

Rate-limit responses (429) from Cloud Armor reach the client as HTTP 429. The
client shows: "Too many attempts. Please try again later."

### 8.3 Email resend rate limiting

Client-side: one resend per 60 seconds per session (defense-in-depth; Firebase also
applies its own resend throttle).

### 8.4 Disposable email blocklist — not in M2

The draft R1 advisory blocklist is removed from M2 v0.1.

**Rationale:** The blocklist is explicitly bypassable (the draft acknowledged this),
adds maintenance overhead, creates false-positive risk for legitimate users with
domains that appear on blocklists, and does not provide a meaningful security
guarantee. The email verification requirement (§1.4) is the correct barrier; the
blocklist added complexity without proportionate benefit.

---

## Part 9: Accessibility and Mobile

### 9.1 Form accessibility

- Handle input: associated `<label>`, `aria-describedby` to format hint, `aria-live="polite"`
  for inline errors, `aria-invalid="true"` when a format error is present.
- Validation state must not rely solely on color (icons or text labels required alongside
  green/red indicators).
- All interactive elements: 44×44 CSS px minimum touch target.

### 9.2 Handle input keyboard

```
inputmode="text"
autocorrect="off"
autocapitalize="none"
spellcheck="false"
```

This prevents autocorrect and autocapitalize from altering the handle as the user types.

### 9.3 Mobile layout

- All states must render at 320px viewport width and larger.
- Success confirmation must be legible without scrolling at 375×667px.
- The email verification prompt must display the full email address.

### 9.4 Loading state discipline

Every loading state ("Claiming your IX ID…") persists until a success or error is
confirmed from the authority. A loading state that resolves to silence (no feedback)
is a contract failure.

---

## Part 10: Idempotency and Retry Behavior

### 10.1 Operation ID management

Generate a fresh UUID per logical operation attempt. Store the UUID in client-side
state for the duration of the attempt. Do not persist across sessions (GET /workspace
is the resume point).

A UUID generated for `CREATE_ACCOUNT` must not be reused for `REGISTER_IX_ID`.

### 10.2 CREATE_ACCOUNT retry

On network error or timeout, retry with the same `operation_id`. The M1 idempotency
contract guarantees safe retry: if the first call committed, the retry returns 200
with the current authoritative snapshot; if it did not commit, the retry creates the
account and returns 201. Both 201 and 200 are success.

### 10.3 REGISTER_IX_ID retry

On network error or timeout, retry with the same `operation_id` and the same handle.
The M1 revision 7 idempotency ordering ensures the retry returns 200 (not 409) if
the first call committed. Both 201 and 200 are success.

**A handle change requires a new `operation_id`.** If the user edits the handle
input after a failed claim attempt, generate a new UUID before the next call.

### 10.4 Session resume

On return in a new session, reconstruct state from GET /workspace (§6). Client does
not persist onboarding progress across sessions.

---

## Part 11: Open Questions — All Resolved

Revision 1 carried five open questions. All are resolved by Revision 2.

| OQ | Resolution |
|---|---|
| OQ-1 Availability check mechanism | Eliminated. No preflight check. `REGISTER_IX_ID` is the atomic availability gate (§5.2). |
| OQ-2 Firebase email/password configuration | Resolved: 12-char minimum, email-enumeration protection enabled, `app.ixid.me` action URL (§1.3). |
| OQ-3 Rate limit enforcement mechanism | Resolved: Cloud Armor per-IP/path only. Per-UID edge limiting contradicts frozen M1 (§8.2). |
| OQ-4 Disposable email blocklist | Resolved: Not in M2 v0.1. email_verified is the admission gate (§8.4). |
| OQ-5 Email verification link behavior | Resolved: Firebase Hosting action-link flow, `app.ixid.me` continue URL, no Dynamic Links. `user.reload()` + `getIdToken(forceRefresh: true)` after return (§1.5). |

---

## Part 12: M2 Gate Definition

M2 is complete when:

1. The authority `email_verified` check (§1.4) is implemented in `verify_firebase_id_token()`.
2. The client-side state machine (Part 4) is implemented.
3. The Firebase action-code flow (§1.5) is configured with `app.ixid.me` continue URL.
4. Password reset (§1.6) is implemented on the sign-in form.
5. Cloud Armor rate limiting policy (§8.2) is deployed.
6. The M2 gate tests pass (§13).
7. Firebase email/password provider is enabled in ixid-prod under the conditions in §1.7.
8. A human-observed production smoke demonstrates the complete forward path
   (sign-up → verification → CREATE_ACCOUNT → REGISTER_IX_ID → workspace) and
   the key returning-user path (sign-in → workspace) and the handle-unavailable
   denial path. No production IX IDs are left as smoke artifacts unless explicitly
   authorized.

---

## Part 13: M2 Gate Tests

These tests must pass before M2 implementation is authorized for production deployment.
They are in addition to the M1 gate tests (which remain the authority for M1 invariants).

```
M2-1. email_verified = false → CREATE_ACCOUNT → 401 UNAUTHENTICATED
      (zero Firestore writes; internal denial reason EMAIL_NOT_VERIFIED in logs)

M2-2. email_verified = false → REGISTER_IX_ID → 401 UNAUTHENTICATED
      (zero Firestore writes)

M2-3. email_verified = true → GET /workspace → 401 (no account)
      force-refresh token → GET /workspace → 401 again
      → CREATE_ACCOUNT 201 → REGISTER_IX_ID 201 → GET /workspace 200
      (full forward path with returning-user 401 probe)

M2-4. email_verified = true (existing account, IX ID) → GET /workspace 200
      ix_ids non-empty → workspace displayed correctly

M2-5. email_verified = true (existing account, no IX ID) → GET /workspace 200
      ix_ids empty → HANDLE_SELECTION reached

M2-6. REGISTER_IX_ID 409 HANDLE_UNAVAILABLE → client stays in HANDLE_SELECTION
      different handle submitted → 201 success

M2-7. REGISTER_IX_ID 422 HANDLE_RESERVED → client stays in HANDLE_SELECTION
      reserved-handle message shown; not the unavailable message

M2-8. REGISTER_IX_ID commit; network response lost; retry with same operation_id
      → 200 (not 409); workspace reached correctly
      (tests revision 7 idempotency ordering at M2 layer)

M2-9. email_verified = true; account SUSPENDED
      → GET /workspace 200 with account_state = SUSPENDED
      → HANDLE_SELECTION not shown; suspended banner shown
      → REGISTER_IX_ID not called

M2-10. email_verified = true; account DISABLED or CLOSED
       → GET /workspace 403 → ACCESS_DENIED_ERROR shown

M2-11. Cloud Armor rate limit: 11th POST /api/holder/v0.1/account from same IP
       within 1 hour → 429; client shows rate-limit message
```

---

## Part 14: M2 Authorized Deliverables

When this Revision 2 contract is accepted by independent review, the following
work is authorized:

1. **Authority `email_verified` check** in `verify_firebase_id_token()`.
2. **M2 gate tests** (Part 13) added to the test suite.
3. **Firebase email/password provider enablement** in ixid-prod, subject to §1.7.
4. **Firebase action-code configuration** with `app.ixid.me` continue URL.
5. **Client onboarding state machine** implementing Part 4, consuming frozen M1 API.
6. **Handle selection UI** with client-side validation (§5.1).
7. **Password reset UI** (§1.6).
8. **Cloud Armor rate limiting policy** (§8.2).
9. **GET /workspace** returning-user resolution (Part 6).

The following work is **NOT authorized** by M2, even after independent review:

- Changes to `ixid-holder-authority-v0.1.md`
- Changes to M1 API routes or response contracts beyond the `email_verified` admission
  check defined in §1.4
- Payment Route implementation (M3)
- Wallet binding (M4)
- Profile management (M5)
- Anonymous Firebase sign-in at any point
- Firebase Dynamic Links

---

## Part 15: Milestone Position

```
M1 — Holder Authority v0.1          CLOSED (d5841d1, 2026-08-20)
    ↓
M2 — IX ID Registration / Onboarding v0.1   THIS DOCUMENT (DRAFT R2)
    ↓
M3 — Payment Route Management v0.1
    ↓
M4 — Payment Route Ownership Verification
    ↓
M5 — Holder Profile Management
    ↓
M6 — ImplicitEx sender/payment integration
```

---

*Reconnaissance and contract design only. Implementation does not begin before this
document is accepted by independent review. The accepted contract is the authority.*

*Revision 2 — Antoine Dennison / ImplicitEx — 2026-08-20*
