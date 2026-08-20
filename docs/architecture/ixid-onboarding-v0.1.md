# IX ID Onboarding v0.1
## M2 Reconnaissance and Contract Design Draft

Status: **DRAFT — awaiting independent review**
Milestone: M2 — IX ID Registration / Onboarding v0.1

Prerequisites: M1 — Holder Authority v0.1 (CLOSED at `d5841d1`, 2026-08-20)

---

## Purpose of this document

This document defines the M2 contract for the user-facing onboarding layer that
drives a visitor from an unauthenticated state to an ACTIVE account with one
registered IX ID handle. It does not define or modify authority operations.

The frozen M1 authority contract (`ixid-holder-authority-v0.1.md`) is the only
implementation target for M2. M2 builds the client-side state machine and
product-layer decisions (authentication method, UI states, error presentation,
abuse controls) on top of that frozen API. No authority behavior changes.

This document answers:

1. Which production authentication method M2 authorizes
2. The complete chronological user journey from unauthenticated to ACTIVE
3. The explicit onboarding state machine (user always knows the next required action)
4. Handle selection, canonicalization feedback, and availability UX
5. Retry and resume behavior
6. Error and denial presentation for each M1 API error code
7. What happens when a returning user already has an account and/or IX ID
8. Authenticated session transition into the holder workspace
9. Abuse controls
10. Accessibility and mobile requirements

---

## Non-Goals (M2 explicit exclusions)

```
NO  changes to ixid-holder-authority-v0.1.md
NO  changes to M1 API surface, routes, or response contracts
NO  payment execution or wallet binding
NO  DOMAIN verification
NO  PAYMENT_ROUTE creation
NO  profile customization (display_name, bio, logo)
NO  business verification
NO  account recovery implementation
NO  multiple IX IDs per account
NO  IX ID transfer or resale
NO  account closure (CLOSE_ACCOUNT)
NO  auth provider migration or revocation
NO  anonymous Firebase sign-in at any point
NO  Sign-In with Ethereum (SIWE) — deferred to wallet binding milestone
NO  ImplicitEx sender/payment integration
NO  production onboarding UI implementation (M2 is reconnaissance + contract design only)
```

---

## Part 1: Authentication Authorization

### 1.1 M1 smoke credential is not a product decision

The M1 smoke used Firebase email/password (`m1-smoke-authority@ixid.me`) to obtain
a Firebase ID token for the live authority loop. Both Firebase providers (email/password
and anonymous) were disabled at M1 closure. Neither was authorized as a product
authentication method by M1 — they were test infrastructure for proving the M1 authority
loop under human observation.

M2 is the document that makes the production authentication decision.

### 1.2 M2 authorized production authentication method

**Primary: Firebase email/password.**

Rationale:
- The frozen M1 authority contract (§3.1) names Firebase email/password as the v0.1
  auth mechanism. M2 implements the onboarding layer for this named mechanism.
- Firebase email/password produces a Firebase ID token that the M1 authority verifies
  via the Admin SDK — no authority changes required.
- Firebase email/password supports email verification before IX ID registration is
  permitted, establishing a minimum identity anchor for the handle namespace.
- More advanced methods (Google OAuth, SIWE) require additional Firebase provider
  configuration and custom token flows; they are appropriate for future milestones.

**Anonymous sign-in: remains disabled.** Anonymous accounts cannot serve as the
stable auth anchor for a persistent economic identity.

**Sign-In with Ethereum (SIWE): not in M2.** Wallet binding is defined in M3/M4.
SIWE-as-authentication requires a custom Firebase token flow (Custom Token via
Admin SDK) that is architecturally separate from the email/password flow and belongs
in the wallet binding milestone.

**Google OAuth and other social providers: not in M2.** Deferred; require explicit
separate authorization.

### 1.3 Provider enablement gate

Firebase email/password may only be enabled in ixid-prod when:

1. This M2 contract has completed independent review and is accepted.
2. The rate limiting and abuse controls described in Part 8 are confirmed to be
   deployable before or coincident with provider enablement.
3. Email verification requirements (§1.4) are confirmed in the client implementation
   before provider enablement in production.
4. Provider enablement must be performed as a deliberate, logged operational step
   with the URL map route for `/api/holder/*` verified live before enabling.

**The provider must not be enabled without all four conditions met.**

### 1.4 Email verification requirement

Firebase email/password allows sign-in before the email address is verified.
M2 must impose a product-layer gate: IX ID registration (`REGISTER_IX_ID`) is
denied at the client layer unless the Firebase user's `emailVerified` claim is
`true` in the current Firebase ID token.

This is a client-side gate, not an authority gate. The M1 authority does not inspect
`emailVerified`; the client must enforce it before calling `REGISTER_IX_ID`.

**Implication:** The onboarding state machine includes an EMAIL_UNVERIFIED state
(§4.4) that appears between authentication and account creation, with a verification
prompt and re-send flow.

**Rationale:** An IX ID handle is a public, persistent namespace identity.
Allowing registration without verified email permits namespace squatting with
throwaway addresses. Email verification is the minimum abuse barrier before a handle
is claimed.

A user may call `CREATE_ACCOUNT` before their email is verified. The account is
created ACTIVE. `REGISTER_IX_ID` is blocked at the client layer until `emailVerified = true`.

---

## Part 2: M1 API Reference (frozen)

The following routes are the only authority endpoints available to M2. They may
not be modified, extended, or bypassed.

```
POST /api/holder/v0.1/account
    Body: {"operation_id": "<uuid>"}
    Auth: Authorization: Bearer <firebase-id-token>
    201: {"account_id": "...", "account_state": "ACTIVE", "account_state_version": 0, "owned_ix_id": null}
    200: idempotent replay (account existed)
    401: unauthenticated or token invalid
    422: MISSING_OPERATION_ID | IDEMPOTENCY_CONFLICT
    403: account SUSPENDED | DISABLED | CLOSED

POST /api/holder/v0.1/ix-id
    Body: {"operation_id": "<uuid>", "handle": "<desired-handle>"}
    Auth: Authorization: Bearer <firebase-id-token>
    201: {"ix_id": "...", "ix_id_state": "ACTIVE", "ix_id_state_version": 0, "owner_account_id": "..."}
    200: idempotent replay (IX ID already registered)
    401: unauthenticated or no account found
    409: HANDLE_UNAVAILABLE (handle taken or reserved — state not distinguished)
    422: MISSING_OPERATION_ID | MISSING_HANDLE | HANDLE_INVALID | HANDLE_RESERVED | IDEMPOTENCY_CONFLICT
    403: account SUSPENDED | DISABLED | CLOSED

GET /api/holder/v0.1/workspace
    Auth: Authorization: Bearer <firebase-id-token>
    200: {"account_id": "...", "account_state": "...", "account_state_version": ..., "ix_ids": [...]}
    401: unauthenticated or no account found
    403: account DISABLED | CLOSED

All responses: Cache-Control: no-store
```

### 2.1 Key authority behaviors M2 must accommodate

**No account = 401 on all paths including workspace.** The client must distinguish
"no account yet" from "bad token" using a combination of the 401 response and local
session state. The authority does not return a disambiguation code.

**`CREATE_ACCOUNT` returns 200 on idempotent replay.** The client must not treat a
200 response as an error. A 200 from `CREATE_ACCOUNT` means the account already existed
and the current authoritative state is returned.

**`REGISTER_IX_ID` returns 200 on idempotent replay.** Same — the IX ID was already
registered by a prior call with the same `operation_id`. This is the success path for
a retry after a lost response.

**Idempotency keys are single-use per logical operation.** A `operation_id` used for
`CREATE_ACCOUNT` cannot be reused for `REGISTER_IX_ID`. The client must generate fresh
UUIDs per operation attempt.

**`owned_ix_id` in the `CREATE_ACCOUNT` idempotent-replay response reflects current
state, not state at original creation.** After `REGISTER_IX_ID` succeeds, a replayed
`CREATE_ACCOUNT` with the same `operation_id` returns `owned_ix_id = "alice"`, not `null`.

---

## Part 3: User Journey Map

The complete journey from unauthenticated visitor to ACTIVE account + registered IX ID.

### 3.1 Forward path (no interruptions)

```
Visitor arrives at onboarding surface
    │
    ▼
[UNAUTHENTICATED]
    No Firebase session exists.
    Onboarding surface shows: sign-up prompt.
    User provides email address and password.
    Client: Firebase signInWithEmailAndPassword() or createUserWithEmailAndPassword()
    │
    ├─ Registration: Firebase creates user account; sends verification email.
    │  Firebase session is established immediately (emailVerified = false).
    │
    ▼
[EMAIL_UNVERIFIED]
    Firebase session exists. emailVerified = false.
    Client: Call CREATE_ACCOUNT (may proceed before email verification).
    Client: Display verification prompt with resend option.
    User: Clicks verification link in email.
    Client: Polls or listens for Firebase auth state change (emailVerified = true).
    │
    ▼
[AUTHENTICATED_NO_ACCOUNT]
    [This state is eliminated by the email-verification-before-account flow above.
     See §3.2 for the path where CREATE_ACCOUNT precedes email verification.]
    │
    ▼
[AUTHENTICATED_NO_IX_ID]
    Firebase session: emailVerified = true.
    Account: ACTIVE (CREATE_ACCOUNT 201 or 200 already received or now called).
    IX ID: none (owned_ix_id = null in CREATE_ACCOUNT response or workspace).
    Client: Show handle selection UI.
    │
    ▼
[HANDLE_SELECTION]
    User types desired handle.
    Client: Apply client-side canonicalization (lowercase, trim).
    Client: Client-side format validation (length, character set, hyphen rules).
    Client: Availability check (§5.2) — show AVAILABLE or UNAVAILABLE indicator.
    User: Confirms handle.
    Client: Generate operation_id UUID.
    Client: Call REGISTER_IX_ID.
    │
    ├─ 201: IX ID registered.
    │
    ▼
[ACTIVE]
    Account ACTIVE. IX ID ACTIVE.
    Client: Transition to authenticated holder workspace (§7).
    Workspace shows: account_id, account_state, ix_ids array.
```

### 3.2 CREATE_ACCOUNT before email verification

The M1 authority accepts `CREATE_ACCOUNT` before `emailVerified = true`. This is the
preferred flow for two reasons:
- The user's Firestore account identity is established early, before they are blocked
  in the verification prompt.
- The handle selection UI is not shown until `emailVerified = true`, so namespace
  squatting without a verified email is not possible.

Recommended client flow:

```
Firebase session established (emailVerified = false)
    │
    ▼
Client calls CREATE_ACCOUNT immediately
(establishes auth_identities + accounts record in M1 authority)
    │
    ▼
Client shows EMAIL_UNVERIFIED state with verification prompt
(no handle selection UI shown)
    │
    ▼
Firebase emailVerified → true (auth state listener fires)
    │
    ▼
Client calls GET /workspace to confirm ACTIVE account + null owned_ix_id
    │
    ▼
Client shows HANDLE_SELECTION state
```

If `CREATE_ACCOUNT` is called before email verification and the email is never verified,
the account exists in M1 Firestore but no IX ID can be claimed. This is acceptable —
the account is a placeholder that does not occupy namespace. The handle-selection gate
is enforced client-side.

### 3.3 Returning user paths

See Part 6 for returning user behavior.

---

## Part 4: Onboarding State Machine

Seven discrete client states. At each state, the user has exactly one unambiguous
next required action.

### 4.1 State: UNAUTHENTICATED

**Condition:** No Firebase session, or Firebase session expired.
**User sees:** Email/password sign-in and sign-up forms.
**Next action:** Sign in (existing user) or sign up (new user).
**Client actions:** None (waiting for Firebase auth event).
**Exits to:**
- `EMAIL_UNVERIFIED` on new Firebase registration
- `RETURNING` on successful sign-in (see Part 6)

### 4.2 State: EMAIL_UNVERIFIED

**Condition:** Firebase session exists; `emailVerified = false`.
**User sees:** "Verify your email to continue. We sent a link to [email]. [Resend]"
**Next action:** Check email and click verification link.
**Client actions:**
- Call `CREATE_ACCOUNT` (idempotent; establishes the M1 account record).
- Start Firebase auth state listener for `emailVerified → true`.
- Offer resend-verification-email action (rate-limited; see §8.3).
**Exits to:**
- `HANDLE_SELECTION` when `emailVerified = true` AND `CREATE_ACCOUNT` 20x received.
- `UNAUTHENTICATED` if user signs out.

### 4.3 State: ACCOUNT_ERROR

**Condition:** `CREATE_ACCOUNT` returned non-20x (403, 422, or unexpected).
**User sees:** Error state with a support link. Do not display raw error codes.
**Next action:** Contact support. No self-serve recovery in M2.
**Exits to:** None in M2 (account recovery is out of scope).
**Note:** 403 at `CREATE_ACCOUNT` means the account is SUSPENDED, DISABLED, or CLOSED.
This should not occur for a newly created Firebase user in normal operation, but may
occur if the account was pre-seeded (administrative action). The error state should
not suggest the user can retry; they should contact support.

### 4.4 State: HANDLE_SELECTION

**Condition:** Firebase `emailVerified = true`; account ACTIVE; `owned_ix_id = null`.
**User sees:** Handle input field with real-time validation and availability feedback.
**Next action:** Type a handle, confirm availability, and claim it.
**Client actions:**
- Client-side format validation (§5.1).
- Availability check via debounced read (§5.2).
- On confirm: generate fresh `operation_id` UUID; call `REGISTER_IX_ID`.
**Exits to:**
- `HANDLE_CLAIMED` on 201 or 200 from `REGISTER_IX_ID`.
- `HANDLE_UNAVAILABLE` on 409 (handle taken or reserved; retry with different handle).
- `REGISTRATION_ERROR` on unexpected error (403, 422 with non-handle-format codes).
- `UNAUTHENTICATED` if Firebase session expires during selection.

### 4.5 State: HANDLE_UNAVAILABLE

**Condition:** `REGISTER_IX_ID` returned 409 HANDLE_UNAVAILABLE.
**User sees:** "That handle is not available. Please choose another."
**Next action:** Return to handle input and choose a different handle.
**Client actions:** Clear current handle input; re-enter HANDLE_SELECTION.
**Note:** The authority returns identical 409 for ACTIVE, SUSPENDED, and TOMBSTONED
handles. The client must not attempt to distinguish these states. The message is the
same in all cases.

### 4.6 State: REGISTRATION_ERROR

**Condition:** `REGISTER_IX_ID` returned 403 or unexpected 422 (not format-related).
**User sees:** Error state. 403 means account is SUSPENDED/DISABLED/CLOSED.
**Next action:** Contact support (same as ACCOUNT_ERROR).
**Note:** A 403 on `REGISTER_IX_ID` means the account state changed between
`CREATE_ACCOUNT` success and `REGISTER_IX_ID`. This is rare but possible (administrative
action). Do not retry automatically.

### 4.7 State: HANDLE_CLAIMED (terminal for onboarding)

**Condition:** `REGISTER_IX_ID` returned 201 or 200 (idempotent replay).
**User sees:** Brief success confirmation ("Your IX ID is @alice"), then transition
to authenticated workspace.
**Client actions:** Transition to GET /workspace and display holder workspace (§7).

---

## Part 5: Handle Selection and Availability

### 5.1 Client-side format validation (before API call)

The client applies these rules before calling `REGISTER_IX_ID`. These rules mirror
the server's §4.1 canonicalization from the M1 contract.

```
1. Lowercase the input string (canonicalize).
2. Reject if length < 3 characters (after canonicalization).
3. Reject if length > 30 characters (after canonicalization).
4. Reject if any character is not [a-z0-9-].
5. Reject if starts with hyphen.
6. Reject if ends with hyphen.
7. Reject if contains consecutive hyphens (--).
```

Client-side feedback is immediate (inline on the input field). Error messages:

| Violation | Message |
|---|---|
| Too short (< 3) | "Handles must be at least 3 characters." |
| Too long (> 30) | "Handles may not exceed 30 characters." |
| Invalid character | "Handles may only contain letters, numbers, and hyphens." |
| Leading hyphen | "Handles may not start with a hyphen." |
| Trailing hyphen | "Handles may not end with a hyphen." |
| Consecutive hyphens | "Handles may not contain consecutive hyphens." |

The client displays the canonicalized form (lowercase) as the user types, so the user
always sees what will be submitted.

### 5.2 Availability check

**Mechanism:** Debounced call to `REGISTER_IX_ID` is NOT the availability check.
The authority does not expose a standalone availability endpoint. The availability
UX is advisory; the authoritative availability determination is made inside the
`REGISTER_IX_ID` transaction.

**Availability signal:** Read the public projection endpoint for the handle.
The public projection at `{handle}.ixid.me` (or equivalent path-based equivalent)
reflects ACTIVE IX IDs. A 200 response from the public projection means the handle
is taken. A 404 means the handle may be available (but may also be reserved — the
projection does not surface reserved handles).

**Alternative:** If the public projection cannot serve availability checks with
acceptable latency, M2 may introduce a lightweight read endpoint on the holder
edge that checks `ix_ids/{canonical_handle}` existence and returns a non-authoritative
EXISTS / NOT_EXISTS / RESERVED signal. This endpoint must:
- Not require authentication.
- Return only EXISTS / NOT_EXISTS / RESERVED — no state, no ownership info.
- Include a disclaimer that the result is advisory, not authoritative.
- Be rate-limited (§8.2).

**This decision is open for independent review.** The preferred mechanism is the
projection-based approach. A new endpoint requires GCP and authority design review.

**Client behavior on availability check:**
- Show "Checking..." while request is in flight.
- Show "Available" (green indicator) on NOT_EXISTS signal.
- Show "Not available" (neutral indicator) on EXISTS or RESERVED signal.
- Do not show "Available" until the check has returned — only show "Checking..." or
  post-check state.
- The availability signal resets whenever the user edits the handle.
- The user may still submit a handle that the check indicated as available;
  the authority is the final arbiter.

### 5.3 Reserved handle presentation

If `REGISTER_IX_ID` returns 422 with code `HANDLE_RESERVED`, the client shows a
distinct message from HANDLE_UNAVAILABLE:

| Code | Message |
|---|---|
| `HANDLE_UNAVAILABLE` (409) | "That handle is not available. Please choose another." |
| `HANDLE_RESERVED` (422) | "That handle is reserved and cannot be registered." |
| `HANDLE_INVALID` (422) | Per §5.1 format errors (client-side; should not reach server) |

The reserved-handle message applies only when the availability check did not catch the
reservation (i.e., the projection returned NOT_EXISTS for a reserved handle that the
authority blocklist catches). This is expected behavior — the authority blocklist is
the canonical source of truth for reservations.

---

## Part 6: Returning User Behavior

### 6.1 User has account and IX ID (complete onboarding)

**Condition:** Firebase sign-in succeeds; GET /workspace returns 200 with `ix_ids`
array non-empty.

**Client behavior:** Skip all onboarding states. Transition directly to the authenticated
holder workspace (§7). The user does not see handle selection UI.

**Idempotency note:** The client may have persisted a prior `operation_id` for
`CREATE_ACCOUNT` or `REGISTER_IX_ID`. These are not reused; each session evaluates
current state from GET /workspace.

### 6.2 User has account but no IX ID

**Condition:** Firebase sign-in succeeds; GET /workspace returns 200 with
`owned_ix_id = null` or empty `ix_ids` array.

**Client behavior:** Skip `EMAIL_UNVERIFIED` and `CREATE_ACCOUNT` steps. Transition
to `HANDLE_SELECTION`. Do not call `CREATE_ACCOUNT` again (account already exists).

**Implementation note:** The client must check `emailVerified` even for returning users.
If the returning user's email is no longer verified (e.g., they changed email addresses),
the client must show EMAIL_UNVERIFIED before handle selection.

### 6.3 User has no account (new session after prior incomplete onboarding)

**Condition:** Firebase sign-in succeeds; GET /workspace returns 401.

**Client behavior:** 401 on GET /workspace means no account exists for this Firebase
identity. Proceed from the beginning: call `CREATE_ACCOUNT`, then handle selection.

**Why GET /workspace to check:** `CREATE_ACCOUNT` is idempotent but consumes an
`operation_id`. Using GET /workspace as the account-existence check avoids burning an
`operation_id` on a check call. The client should call GET /workspace first and only
call `CREATE_ACCOUNT` if 401.

### 6.4 User account is SUSPENDED

**Condition:** GET /workspace returns 200 with `account_state = "SUSPENDED"`.

**Client behavior:** The workspace is readable. Show a SUSPENDED state banner
("Your account is under review. Handle registration is unavailable."). Do not show
handle selection UI. Do not call `REGISTER_IX_ID`. The user may view their existing
workspace state.

**REGISTER_IX_ID is blocked by the client**, consistent with §3.5 of the M1
contract (SUSPENDED accounts are denied mutations; 403 from authority).

### 6.5 User account is DISABLED or CLOSED

**Condition:** GET /workspace returns 403.

**Client behavior:** Show ACCESS_DENIED error state. Direct user to contact support.
No self-serve path exists in M2.

---

## Part 7: Authenticated Workspace Transition

### 7.1 What the holder workspace displays

After successful onboarding (ACTIVE account + ACTIVE IX ID), the client shows the
holder workspace using data from GET /workspace.

Minimum display requirements:

| Field | Display label | Notes |
|---|---|---|
| `account_state` | Account status | Show only if non-ACTIVE (ACTIVE is the expected state; not useful to display) |
| `ix_ids[0].ix_id` | Your IX ID | The registered handle |
| `ix_ids[0].ix_id_state` | Handle status | Show only if non-ACTIVE |

The workspace at M2 is minimal — it confirms the user's IX ID is registered and active.
Profile management, wallet binding, and payment routes are future milestones.

### 7.2 What the workspace does not display

M2 workspace must not display or attempt to construct:
- Payment routing information (no PAYMENT_ROUTE claim in M2)
- Wallet binding status (no PAYMENT_ROUTE claim in M2)
- Public identity page link (Identity Page is a separate milestone concern)
- Verification claim status (no claims created in M2)

### 7.3 Session persistence

The client should maintain the Firebase session and refresh the ID token as needed.
Firebase ID tokens expire after one hour; the Firebase SDK refreshes them automatically
using the refresh token.

The client must not store Firebase ID tokens in localStorage. The Firebase SDK manages
token storage; the client should use the Firebase auth state listener exclusively.

---

## Part 8: Abuse Controls

### 8.1 Namespace harvesting prevention

The M1 authority enforces the handle-ownership invariant (one IX ID per account in v0.1).
This means a single Firebase identity cannot claim multiple handles — each
`REGISTER_IX_ID` attempt succeeds at most once per account. This limits traditional
namespace harvesting to one handle per Firebase email address.

The residual threat is automated account creation: an attacker registers many email
addresses, creates one account per address, and claims one handle per account.

M2 abuse controls address this at three layers:

1. **Email verification gate (§1.4):** Handle registration requires `emailVerified = true`.
   This raises the cost per namespace claim to the cost of receiving one verified email.
   Disposable email addresses that can receive verification emails are not fully blocked
   by this control, but bulk claiming requires disposable-email-scale infrastructure.

2. **Rate limiting on `CREATE_ACCOUNT` and `REGISTER_IX_ID` at the edge (§8.2):**
   Per-IP and per-Firebase-UID rate limits applied by `ixid-holder-edge` before
   forwarding to the authority.

3. **Email domain blocklist (§8.4):** The client may apply a client-side blocklist of
   known disposable email domains at account registration time.

These controls reduce bulk automated namespace claiming without changing the M1
authority's ownership semantics.

### 8.2 Rate limits

Rate limits are applied at `ixid-holder-edge` before forwarding to the authority.
The authority itself does not implement rate limiting (rate limiting is a
defense-in-depth concern, not an authority concern).

Recommended limits for M2:

| Operation | Per-IP limit | Per-UID limit | Window |
|---|---|---|---|
| `CREATE_ACCOUNT` | 5 requests | 5 requests | 1 hour |
| `REGISTER_IX_ID` | 10 requests | 3 requests | 1 hour |
| GET /workspace | 60 requests | 120 requests | 1 hour |
| Availability check (if separate endpoint) | 30 requests | — | 1 minute |

These values are recommendations subject to operational adjustment. They must be
tunable via Cloud Armor or equivalent without a code deploy.

Exceeding a rate limit returns 429 Too Many Requests with a `Retry-After` header.
The client must display a rate-limit error state ("Too many attempts. Please try again
in a few minutes.") and disable the submit action for the indicated period.

**Rate limit implementation note:** Per-UID rate limits require the Firebase UID
(from the verified token) to be available at the edge. The edge already verifies the
Firebase token — the UID is available from the decoded token claims. Do not use a
raw client-supplied identifier for rate limiting.

### 8.3 Resend-verification-email rate limiting

The client must enforce client-side rate limiting on the "Resend verification email"
action. Minimum: one resend per 60 seconds per session. Firebase also applies its own
limits; client-side limits prevent user-visible error states from Firebase throttles.

### 8.4 Disposable email domain blocklist (advisory)

The client may apply a community-maintained blocklist of known disposable email domains
at account registration time (before calling Firebase `createUserWithEmailAndPassword`).
If the user's email domain matches the blocklist, the client shows an advisory message:
"Please use a permanent email address for your IX ID."

This is a client-side advisory, not an authority gate. A motivated attacker can bypass
it. Its purpose is to reduce accidental use of disposable addresses by ordinary users
(who then lose access when the address expires).

**The blocklist is an advisory UX control, not a security invariant.** It must not be
treated as a security boundary. It does not prevent all namespace squatting.

---

## Part 9: Accessibility and Mobile Requirements

### 9.1 Form accessibility

The handle input field must:
- Have an associated `<label>` element.
- Have descriptive `aria-describedby` pointing to the format hint text.
- Display format errors using `aria-live="polite"` announcements so screen readers
  announce the error without requiring focus change.
- Use `aria-invalid="true"` on the input when a format error is present.
- Not rely solely on color to indicate validation state (green/red must also have icons
  or text labels).

### 9.2 Availability indicator accessibility

The availability check indicator must:
- Use `aria-live="polite"` to announce state changes ("Checking...", "Available",
  "Not available").
- Not use spinner-only states (spinner must have a text equivalent for screen readers).

### 9.3 Mobile requirements

- All onboarding states must render correctly on screens 320px wide and larger.
- The handle input must trigger the appropriate soft keyboard on iOS and Android.
  Use `inputmode="text"` with `autocorrect="off"` and `autocapitalize="none"`.
- Touch target minimum size: 44×44 CSS px for interactive elements (submit buttons,
  resend link).
- The email verification prompt must display the email address the verification was
  sent to, so the user can check the right inbox on a mobile device.
- The success confirmation screen must be legible without scrolling on a 375×667px
  viewport (iPhone SE).

### 9.4 Loading and error states must not disappear prematurely

Each loading state ("Claiming your IX ID...") must persist until either a success
transition or an error is confirmed. Premature clearing of the loading state followed
by a silent failure is a known usability failure in registration flows.

---

## Part 10: Idempotency and Retry Behavior

### 10.1 Operation ID management

The client must generate a fresh UUID for each distinct operation attempt. The UUID must
be stored in client-side state (not sent to the server until the operation is attempted)
and persisted across brief interruptions (page refresh within the same session).

An `operation_id` generated for `CREATE_ACCOUNT` must not be reused for
`REGISTER_IX_ID`. Each operation type has its own independent `operation_id`.

### 10.2 CREATE_ACCOUNT retry behavior

If `CREATE_ACCOUNT` returns a network error or times out, the client may retry with
the same `operation_id`. The M1 authority's idempotency contract guarantees that
a retry with the same `operation_id` and identical payload returns the current
authoritative account snapshot (200) if the first call committed, or creates the
account (201) if it did not.

The client treats both 201 and 200 from `CREATE_ACCOUNT` as success.

### 10.3 REGISTER_IX_ID retry behavior

If `REGISTER_IX_ID` returns a network error or times out, the client may retry with
the same `operation_id` and the same handle. The M1 authority's idempotency contract
(revision 7 ordering) guarantees:

- If the first call committed: the retry finds the exact receipt, bypasses the
  handle-existence check (which would otherwise return 409), and returns the current
  authoritative snapshot (200).
- If the first call did not commit: the retry proceeds normally.

The client treats both 201 and 200 from `REGISTER_IX_ID` as success.

**The client must not generate a new `operation_id` on retry** unless the user
explicitly changes the handle input. Changing the handle requires a new `operation_id`.

### 10.4 Session interruption

If the user closes the browser and returns in a new session, the onboarding state is
reconstructed by calling GET /workspace after sign-in. The client does not need to
persist onboarding state across sessions — the workspace is the authoritative resume point.

On resume:
- 401 on GET /workspace → no account exists → restart from CREATE_ACCOUNT.
- 200 with `owned_ix_id = null` → account exists, no IX ID → go to HANDLE_SELECTION.
- 200 with `owned_ix_id` non-null → onboarding complete → go to workspace.
- 403 → DISABLED/CLOSED → show ACCESS_DENIED error.

---

## Part 11: Open Questions for Independent Review

These items require resolution before M2 implementation is authorized.

### OQ-1: Availability check mechanism

Two options are identified in §5.2:
- **Option A:** Projection-based check (existing endpoint; no new components)
- **Option B:** New advisory endpoint on holder edge

Option B requires GCP and authority design review. Option A uses existing infrastructure
but may have latency or caching behavior that makes it unsuitable for availability
feedback. **Independent review should select one.**

### OQ-2: Firebase email/password provider configuration

When email/password is enabled in ixid-prod, the following Firebase configuration
decisions must be made explicitly:
- **Password minimum strength:** Firebase allows requiring uppercase, numbers, symbols.
  Minimum: 8 characters. Recommended: 12+ characters.
- **Email enumeration protection:** Firebase can prevent callers from learning
  whether an email is registered via error messages. This should be enabled.
- **Action code settings:** Verification email URL domain must be ixid.me (not
  firebaseapp.com). This requires Firebase console configuration.

These are configuration decisions, not architecture decisions, but they must be
explicitly confirmed before provider enablement.

### OQ-3: Rate limit enforcement mechanism

§8.2 describes rate limits at `ixid-holder-edge`. The implementation options are:
- **Cloud Armor security policy** (GCP-native; works at LB level)
- **Per-request rate limiting in the edge handler** (application-level)

Cloud Armor is recommended (defense in depth; no application code). This requires
a GCP change (Cloud Armor policy attached to the load balancer). Independent review
should confirm this is acceptable scope for M2 deployment.

### OQ-4: Disposable email domain blocklist maintenance

§8.4 describes an advisory client-side blocklist. This requires:
- Selecting a community-maintained list (e.g., `disposable-email-domains` npm package)
- Deciding whether the list is bundled at build time or fetched at runtime
- Confirming that including such a list does not create legal liability (email addresses
  that happen to be on the list but are legitimate)

### OQ-5: Handle display in verification email flow

During EMAIL_UNVERIFIED state, the user has not yet seen the handle selection UI.
When the user verifies their email, are they redirected back to the handle selection
state in the same browser tab, or do they need to sign in again?

Firebase's email verification link behavior depends on whether `handleCodeInApp`
is set. If `handleCodeInApp = true`, the user is returned to the app in the same
browser (same Firebase session). If `false`, the user verifies in a generic Firebase
page and must return to the app manually.

**Recommendation:** `handleCodeInApp = true` with the action URL set to the
ixid.me onboarding path. This requires Firebase Dynamic Links or equivalent.
This decision affects the email verification UX significantly and requires
explicit confirmation.

---

## Part 12: M2 Authorized Deliverables

When this M2 contract is accepted by independent review, the following work is authorized:

1. **Firebase email/password provider enablement** in ixid-prod, subject to the
   conditions in §1.3 and the configuration decisions in OQ-2.

2. **Client-side onboarding state machine implementation** consuming the frozen M1 API.

3. **Handle selection UI** with client-side validation (§5.1) and availability feedback (§5.2).

4. **Rate limiting** at `ixid-holder-edge`, per OQ-3 resolution.

5. **GET /workspace** consumption for returning-user detection (§6).

6. **Email verification flow** with `handleCodeInApp` configuration per OQ-5 resolution.

The following work is **NOT authorized** by M2, even after independent review:

- Changes to `ixid-holder-authority-v0.1.md`
- Changes to M1 authority routes or response contracts
- Payment Route implementation (M3)
- Wallet binding (M4)
- Profile management (M5)
- Anonymous Firebase sign-in enablement at any point

---

## Part 13: Milestone Position

```
M1 — Holder Authority v0.1        CLOSED (d5841d1, 2026-08-20)
    ↓
M2 — IX ID Registration / Onboarding v0.1   THIS DOCUMENT (DRAFT)
    ↓
M3 — Payment Route Management v0.1
    ↓
M4 — Payment Route Ownership Verification
    ↓
M5 — Holder Profile Management
    ↓
M6 — ImplicitEx sender/payment integration
```

M2 does not authorize M3 or any downstream work. M3 begins only after M2 is closed.

---

*Reconnaissance and contract design only. Implementation does not begin before this
document is accepted by independent review. The accepted contract is the authority.*

*Draft — Antoine Dennison / ImplicitEx — 2026-08-20*
