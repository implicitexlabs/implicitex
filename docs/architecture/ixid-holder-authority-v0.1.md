# IX ID Holder Authority v0.1
## Specification — FROZEN

Freeze date: 2026-08-19 (revision 7)
Status: **FROZEN**

---

## Relationship to frozen documents

This specification **amends** `ixid-firestore-schema-v0.1.md` in the
account/IX-ID separation described in Part 2. It does **not** modify the
already-frozen verification-claim lifecycle, evidence schema, claim state
machines, or Scheduler/Projection stack.

```
Holder Authority v0.1 supersedes the account-container interpretation
    of ix_ids/{ix_id} in ixid-firestore-schema-v0.1.md §1.

Claim lifecycle, evidence collections, wallet_binding_events,
domain challenges/records, identity_mutations, security_events,
ix_transaction_refs, review_cases, preservation_holds
    → remain unchanged and frozen.
```

`ixid-identity-trust-architecture-v0.1.md` is not modified. All eight
architectural invariants (§I-1 through §I-8) remain binding.

---

## Purpose of this document

This document defines the authoritative contract for:

1. What constitutes an authenticated IX ID holder session
2. How a stable IX account identity is established from an authenticated principal
3. How an authenticated account claims ownership of an IX ID handle
4. What creation operations a holder may perform, by what mechanism, under what safeguards
5. How those operations are recorded as immutable audit evidence
6. Explicit scope constraints (what this milestone does NOT authorize)

---

## Non-Goals (explicit exclusions from this milestone)

```
NO  payment execution
NO  wallet ownership verification (wallet binding is a separate milestone)
NO  DOMAIN verification changes
NO  PAYMENT_ROUTE claim creation or mutation
NO  profile customization (display_name, bio, logo, etc.)
NO  business verification
NO  ratings or reputation
NO  account recovery implementation
NO  multiple-account ownership model
NO  IX ID transfer or resale
NO  account closure (CLOSE_ACCOUNT is not a v0.1 operation)
NO  auth identity revocation (schema supports it; not implemented)
NO  mutation of existing IX ID state (no profile, payment route, or state transitions)
NO  stale-revision enforcement (no mutations against existing state in v0.1)
NO  production onboarding UI beyond what proves the authority loop
NO  ImplicitEx sender/payment integration
```

**v0.1 defines only two authority operations: `CREATE_ACCOUNT` and `REGISTER_IX_ID`.** `CREATE_ACCOUNT` creates the account authority state. `REGISTER_IX_ID` creates a new IX ID and performs exactly one one-time mutation of the existing account ownership sentinel: `accounts/{account_id}.owned_ix_id`: null → canonical_handle. v0.1 contains no operation that mutates an existing IX ID document after registration and no general-purpose holder-state update operation. The contract for general holder-state revision belongs to a future milestone (Part 10).

**CLOSED account state and TOMBSTONED IX ID state** are defined lifecycle states
whose transitions are reserved for a future account-lifecycle authority milestone.
This milestone defines their schema and invariants but does not implement the
authority operations that cause them. Gate testing uses seeded fixture state.

---

## Part 1: Core Object Model

### 1.1 Four distinct layers

```
Auth Principal
    Ephemeral, provider-specific (Firebase ID-token iss + sub).
    Valid for one session. Never stored as a permanent IX identifier.
    Subject is used exactly as verified — no case transformation.

Auth Identity Mapping
    Links provider-specific (exact issuer, exact subject) to a stable IX account_id.
    Key is an opaque deterministic digest — never the raw subject.
    Issuer is scoped to the Firebase project, preventing cross-project identity
    collisions even when UIDs happen to be identical across projects.
    Permits multiple auth methods per account (future).
    Permits auth provider migration and auth identity revocation
    without account identity change.

Account
    The stable IX-owned identity of the human controller.
    account_id is IX-generated and opaque — not a Firebase UID.
    Has its own state machine, independent of any IX ID.

IX ID
    The persistent public namespace identity.
    A canonical handle (e.g., "mariastacos").
    Controlled by exactly one Account (v0.1: no transfers).
    Survives wallet changes, auth method changes, display name changes.

Payment Route
    Out of scope for this milestone.
    Defined in: Payment Route Management v0.1 (future).
```

### 1.2 Invariant: IX ID survives all controller-layer changes

```
Account Alice (account_id = ix_8f3a...)
    → controls mariastacos

Alice authenticates via new method:
Account Alice (account_id = ix_8f3a... unchanged)
    → still controls mariastacos

Alice replaces wallet (future milestone):
Account Alice (account_id = ix_8f3a... unchanged)
    → still controls mariastacos → routes to Wallet B
```

The IX ID is stable. The account_id is stable.
Auth method, wallet, and display name are mutable through defined operations.

### 1.3 State machine independence

```
ACCOUNT STATE
    ACTIVE / SUSPENDED / DISABLED / CLOSED
    Governs whether the controller may act.
    SUSPENDED: may read own workspace; may not perform mutations.
    DISABLED / CLOSED: denied all access, including workspace reads.

IX ID NAMESPACE STATE
    ACTIVE / SUSPENDED / TOMBSTONED
    CLAIMED is eliminated. ACTIVE is the initial state at version 0.
    Does not imply payment capability.

VERIFICATION / PAYMENT-ROUTE CLAIM STATE
    Defined in ixid-identity-trust-architecture-v0.1.md (frozen).
    Out of scope for this milestone.
```

ACTIVE account + ACTIVE IX ID does **not** imply the IX ID is payable.
Payment capability requires a separate, verified PAYMENT_ROUTE claim.

---

## Part 2: Schema

### 2.1 New collection: `auth_identities/{identity_key}` **[SCHEMA DELTA — NEW]**

`identity_key` is an **opaque deterministic digest** of the exact verified auth principal:

```
identity_key = hex(SHA-256(verified_token_iss + "\x00" + verified_token_sub))
```

`verified_token_iss` and `verified_token_sub` are taken **exactly as they appear in
the verified Firebase ID token**. No case transformation is applied to either field.

For Firebase Authentication with project `ixid-prod`:
- `verified_token_iss = "https://securetoken.google.com/ixid-prod"` (exact token `iss` claim)
- `verified_token_sub = uid` (exact token `sub` claim)

Including the full `iss` URL (which embeds the project ID) namespaces the mapping to
the Firebase project. A UID identical across two Firebase projects produces a different
`identity_key` because the `iss` values differ.

**The `identity_key` is computed server-side from the verified token. Never client-supplied.**

#### 2.1.1 Fields

**Linking evidence fields (permanently preserved)**

| Field | Type | Notes |
|---|---|---|
| `identity_key` | string | Document key: opaque deterministic digest |
| `issuer` | string | Exact `iss` claim from verified token |
| `subject` | string | Exact `sub` claim from verified token (the Firebase UID) |
| `account_id` | string | IX-generated stable account identifier |
| `linked_at` | timestamp | When this auth identity was first linked |
| `linking_event_id` | string | Pointer to `account_events` record for this link |

The linking evidence fields are **permanently preserved** — never overwritten.

**Lifecycle-mutable fields**

| Field | Type | Notes |
|---|---|---|
| `auth_identity_state` | enum | `ACTIVE` \| `REVOKED`. Set to `ACTIVE` at creation. |
| `revoked_at` | timestamp or null | Null until revoked. |
| `revocation_event_id` | string or null | Pointer to revocation event, or null. |

A REVOKED auth identity cannot be used to authenticate or create accounts.
Revocation does not change the linked `account_id`.

**Revocation is out of scope for v0.1.** No v0.1 operation sets `auth_identity_state = REVOKED`.

---

### 2.2 New collection: `accounts/{account_id}` **[SCHEMA DELTA — NEW]**

`account_id` is an IX-generated opaque stable identifier (e.g., `ix_` + random 128 bits,
URL-safe base64). Not a Firebase UID, not an email, not derived from any external system.

#### 2.2.1 Account document fields

**Immutable after creation**

| Field | Type | Notes |
|---|---|---|
| `account_id` | string | IX-generated; document key |
| `created_at` | timestamp | Account creation timestamp |
| `creation_auth_identity_key` | string | The `auth_identities` key used at account creation |
| `creation_security_event_id` | string | Pointer to first `account_events` record |

**Lifecycle-mutable**

| Field | Type | Notes |
|---|---|---|
| `account_state` | enum | `ACTIVE` \| `SUSPENDED` \| `DISABLED` \| `CLOSED` |
| `account_state_version` | integer | Starts at 0; incremented by exactly 1 per state transition |
| `account_state_changed_at` | timestamp | Timestamp of most recent state change |
| `owned_ix_id` | string or null | Canonical handle owned by this account; null if none. Set atomically during REGISTER_IX_ID (§4.5). Never changed after set (v0.1 — no transfers). |

**`owned_ix_id` is the transactional uniqueness sentinel for one-IX-ID-per-account.**
It is read and written in the same Firestore transaction as REGISTER_IX_ID, providing
a single contention point. Two concurrent registrations by the same account — even for
different handles — contend on this field. Exactly one can set it from null; the other
conflicts and aborts.

#### 2.2.2 Account state machine

```
ACTIVE
    The account holder may authenticate and perform permitted operations.

SUSPENDED
    Authentication resolves to a stable account_id.
    The holder may read their AuthenticatedHolderWorkspace (§5.3).
    All mutations are denied pending review.
    May resolve to ACTIVE (cleared) or DISABLED/CLOSED (confirmed violation).

DISABLED
    Authentication resolves but all access is permanently denied.
    Confirmed policy violation without full closure.

CLOSED
    Terminal. No transitions out.
    Auth sessions should be revoked.
    The CLOSED account document is preserved permanently (§2.2.5).
    Owned IX IDs transition to TOMBSTONED (§2.3.3).
```

State transitions:

| From | To | Authority |
|---|---|---|
| `ACTIVE` | `SUSPENDED` | IX administrative action |
| `ACTIVE` | `CLOSED` | Controller request OR IX administrative action |
| `SUSPENDED` | `ACTIVE` | IX administrative action (cleared) |
| `SUSPENDED` | `DISABLED` | IX administrative action (confirmed) |
| `SUSPENDED` | `CLOSED` | Controller request OR IX administrative action |
| `DISABLED` | `CLOSED` | IX administrative action |
| `CLOSED` | — | Terminal. No transitions. |

Account state is independent of IX ID state.

#### 2.2.3 Ownership cardinality (v0.1) **[Q-C: CLOSED]**

- Exactly one controlling account per IX ID; `owner_account_id` is immutable.
- Exactly one IX ID per account in v0.1, enforced via `owned_ix_id` sentinel (§4.5).

#### 2.2.4 Account events subcollection: `accounts/{account_id}/account_events/{event_id}`

Append-only. Every state transition, auth event, and significant account operation
must produce a record here before the change is committed.

| Field | Type |
|---|---|
| `event_id` | string (UUID) |
| `event_type` | enum: `ACCOUNT_CREATED` \| `AUTH_IDENTITY_LINKED` \| `STATE_TRANSITION` \| `AUTH_SUCCESS` \| `AUTH_FAILURE` \| `SESSION_REVOKED` \| `AUTH_IDENTITY_REVOKED` (future) |
| `account_id` | string |
| `from_state` | enum or null |
| `to_state` | enum or null |
| `prior_state_version` | integer or null |
| `resulting_state_version` | integer or null |
| `operation_id` | string or null |
| `actor` | enum: `CONTROLLER` \| `IX_ADMIN` \| `IX_SYSTEM` |
| `occurred_at` | timestamp |
| `reason` | string or null |

No authentication secret (password hash, token, session key, raw auth subject)
may appear in any event record. The `identity_key` digest may appear as a
reference; the raw Firebase UID must not.

#### 2.2.5 CLOSED accounts are preserved, not deleted

Closing an account does not delete the `accounts/{account_id}` document,
`account_events` records, or any associated evidence. All are preserved permanently
to maintain audit trail integrity and tombstone validity.

---

### 2.3 Modified collection: `ix_ids/{ix_id}` **[SCHEMA DELTA — AMENDMENT]**

The existing schema (`ixid-firestore-schema-v0.1.md §1`) placed `account_status`
on this document. This document supersedes that interpretation for the account/ownership
fields only. Claim lifecycle fields, subcollections, and evidence schema are unchanged.

#### 2.3.1 Field additions/replacements on `ix_ids/{ix_id}`

**Immutable after creation (new fields)**

| Field | Type | Notes |
|---|---|---|
| `owner_account_id` | string | IX-generated stable account_id of controlling account. Set atomically at registration. Never changed (v0.1). |

**Lifecycle-mutable (replacements for `account_status`)**

| Field | Type | Notes |
|---|---|---|
| `ix_id_state` | enum | `ACTIVE` \| `SUSPENDED` \| `TOMBSTONED`. Replaces `account_status`. |
| `ix_id_state_version` | integer | Starts at 0; incremented by exactly 1 per transition. |
| `ix_id_state_changed_at` | timestamp | Timestamp of most recent state change. |

**[MIGRATION NOTE]:** No live Firestore documents use `account_status` at this time.
If any are found before implementation, a migration plan is required first.

#### 2.3.2 IX ID namespace state machine

```
ACTIVE
    Initial state at version 0. Set immediately upon successful registration.
    No transient state exists between document creation and operational availability.
    Does NOT imply payment capability.

SUSPENDED
    Administrative action by IX. Permitted holder operations are denied.
    May return to ACTIVE on resolution.

TOMBSTONED
    Terminal. No transitions out. Handle permanently reserved.
    Set when the controlling account transitions to CLOSED.
    Document is preserved permanently. Handle is never recycled.
```

**CLAIMED is eliminated.** ACTIVE is the initial namespace state at version 0.

State transitions:

| From | To | Authority | Required evidence |
|---|---|---|---|
| (nonexistent) | `ACTIVE` | `REGISTER_IX_ID` operation | `ix_id_state_events` REGISTRATION record |
| `ACTIVE` | `SUSPENDED` | IX administrative action | `ix_id_state_events` STATE_TRANSITION record |
| `ACTIVE` | `TOMBSTONED` | Account CLOSED | `ix_id_state_events` STATE_TRANSITION record |
| `SUSPENDED` | `ACTIVE` | IX administrative action (cleared) | `ix_id_state_events` STATE_TRANSITION record |
| `SUSPENDED` | `TOMBSTONED` | Account CLOSED | `ix_id_state_events` STATE_TRANSITION record |
| `TOMBSTONED` | — | Terminal | — |

#### 2.3.3 Tombstone invariant

When an IX ID reaches `TOMBSTONED` state, its document persists permanently.
The handle is never recycled. A registration attempt for a TOMBSTONED handle
returns 409 HANDLE_UNAVAILABLE — identical to the response for an ACTIVE or
SUSPENDED handle. The caller cannot distinguish among these states.

#### 2.3.4 IX ID state events subcollection: `ix_ids/{ix_id}/ix_id_state_events/{event_id}`

Append-only. Every REGISTER_IX_ID operation and ix_id_state transition must
produce a record here atomically within the same Firestore transaction.

| Field | Type |
|---|---|
| `event_id` | string (UUID) |
| `operation_id` | string (idempotency key) |
| `operation_type` | enum: `REGISTRATION` \| `STATE_TRANSITION` |
| `account_id` | string (performing/authorizing account) |
| `from_ix_id_state` | enum or **null** (null for REGISTRATION) |
| `to_ix_id_state` | enum |
| `prior_ix_id_state_version` | integer or **null** (null for REGISTRATION) |
| `resulting_ix_id_state_version` | integer |
| `occurred_at` | timestamp |
| `actor` | enum: `CONTROLLER` \| `IX_ADMIN` \| `IX_SYSTEM` |
| `reason` | string or null |

**Registration event canonical values:**
- `from_ix_id_state = null` — document did not exist before
- `to_ix_id_state = ACTIVE`
- `prior_ix_id_state_version = null` — no prior version; this is the origin
- `resulting_ix_id_state_version = 0`

`null` (not `0`) for the prior version correctly marks this event as the origin.

---

### 2.4 New collection: `holder_operation_receipts/{operation_id}` **[SCHEMA DELTA — NEW]**

Idempotency receipts for all holder authority operations. Document key is the
caller-supplied `operation_id` UUID.

| Field | Type | Notes |
|---|---|---|
| `operation_id` | string | Document key; caller-supplied UUID |
| `principal_identity_key` | string | Opaque digest of the auth principal that performed this operation |
| `operation_type` | enum | `CREATE_ACCOUNT` \| `REGISTER_IX_ID` |
| `target_ix_id` | string or null | Canonical handle; null for `CREATE_ACCOUNT` |
| `payload_fingerprint` | string | SHA-256 of canonical payload (see §5.6) |
| `resolved_account_id` | string | IX account_id that was resolved or created |
| `result_ix_id_state_version` | integer or null | Resulting ix_id_state_version; null for `CREATE_ACCOUNT` |
| `is_noop` | boolean | True if operation found the desired state already existing |
| `occurred_at` | timestamp | When the receipt was written |

The receipt for a creation operation must be written inside the same Firestore
transaction as the mutation. For the `CREATE_ACCOUNT` concurrent-loser (no-op) path,
the receipt is written inside the same transaction that reads the existing auth mapping
and account state — see §5.4.1.

**Every successful operation call consumes its `operation_id` by writing a receipt,
even on the no-op path.** An `operation_id` without a receipt is un-consumed and
can later be reused, which the idempotency contract prohibits.

---

## Part 3: Authentication and Account Resolution

### 3.1 Authentication mechanism (v0.1)

Firebase Authentication (email/password).

- The Holder Authority Service verifies Firebase ID tokens using the Firebase Admin SDK.
- Token verification confirms the `aud` claim matches `ixid-prod`, rejecting tokens from
  other Firebase projects at verification time.
- The verified token yields exact `iss` and `sub` values (no transformation).
- The service computes `identity_key = hex(SHA-256(iss + "\x00" + sub))`.
- No client-supplied account identifier is accepted anywhere in the holder authority API.

### 3.2 Account resolution sequence

```
Incoming request
    │
    ▼
Verify Firebase ID token (Firebase Admin SDK)
    INVALID / MISSING → 401
    Token aud ≠ ixid-prod → 401
    │
    ▼
Extract exact iss and sub from verified token
Compute identity_key = hex(SHA-256(iss + "\x00" + sub))
    │
    ▼
Read auth_identities/{identity_key}
    NOT FOUND → 401 (for all operations except CREATE_ACCOUNT; see §3.3)
    FOUND, auth_identity_state == REVOKED → 401
    FOUND, auth_identity_state == ACTIVE → account_id = record.account_id
    │
    ▼
Read accounts/{account_id}
    NOT FOUND → 500 (internal consistency failure; log; alert)
    account_state == DISABLED → 403
    account_state == CLOSED → 403
    account_state == SUSPENDED → proceed; operation handler enforces read-only
    account_state == ACTIVE → proceed
    │
    ▼
Pass (account_id, account_state, identity_key) to operation handler
```

The client never learns the stable `account_id` from the authentication path.
The `identity_key` digest may be logged for operational correlation.
The raw Firebase UID (`sub`) must not be logged outside the `auth_identities` document.

### 3.3 Account creation

`CREATE_ACCOUNT` is a first-class v0.1 authority operation (§5.4.1, §5.7).

On first-time authentication — when `auth_identities/{identity_key}` is not found —
the resolution sequence returns 401 with a reason code indicating registration is required.
The client calls `CREATE_ACCOUNT` with an `operation_id`; the authority atomically creates
both `accounts/{new_account_id}` and `auth_identities/{identity_key}`.

**Current account state outranks replay semantics.** If `auth_identities/{identity_key}`
already exists and is ACTIVE, the response depends on the *current* account state, not
the state at the time the operation receipt was written. An account suspended since the
last successful CREATE_ACCOUNT call will receive 403, not the cached account snapshot.

### 3.4 Recovery boundary (defined, not implemented)

Recovery must restore access to the existing stable `account_id` by adding a new
`auth_identities` entry pointing to it. A compromised auth identity can be REVOKED
without changing the `account_id`. Both capabilities are out of scope for v0.1.

---

## Part 4: Handle Policy

### 4.1 Canonicalization (closed)

- **Length:** 3–30 characters inclusive, after canonicalization.
- **Allowed characters:** lowercase ASCII letters (`a-z`), digits (`0-9`), hyphens (`-`).
- **Hyphens:** not at position 0, not at the last position, not consecutive.
- **Canonicalization:** server lowercases the input, then validates it.
- **Normalization precedes availability lookup.**
- **Storage:** canonical form is always the Firestore document key and `ix_id` field.
- **DNS alignment:** canonical form = DNS label: `{ix_id}.ixid.me`.

**Unicode handles:** not supported in v0.1. ASCII only.

### 4.2 Reserved handles (v0.1 reserved set)

The **v0.1 reserved set** — not characterized as permanently complete. Additions
require a code change.

- Single-character handles (`a`–`z`, `0`–`9`)
- Two-character handles

```
# IX and product control-plane
implicitex, ixid, ixid-me, holder, auth, login, signin, signup,
account, accounts, wallet, pay, payment, payments, checkout,
verify, verification, app

# Infrastructure and operations
api, www, mail, dev, staging, prod, test, root, system, status,
health, healthz, metrics, static, assets, cdn, docs,
noreply, postmaster, hostmaster, webmaster

# Trust and safety
admin, support, abuse, security, legal, help
```

The blocklist is hardcoded. No env-var or config injection permitted.

### 4.3 Deceptive handle screening

Not in v0.1. Addressed reactively through IX administrative `ix_id_state` transitions.

### 4.4 Ownership cardinality **[Q-C: CLOSED]**

- Exactly one controlling account per IX ID; `owner_account_id` is immutable.
- Exactly one IX ID per account in v0.1, enforced via `owned_ix_id` sentinel (§4.5).

### 4.5 Atomic claim

```
BEGIN TRANSACTION

  1. Read accounts/{account_id}
     owned_ix_id != null → ABORT → 409 HANDLE_UNAVAILABLE
       (one-per-account invariant; existing owned IX ID blocks second claim)

  2. Read ix_ids/{canonical_handle}
     EXISTS (any ix_id_state) → ABORT → 409 HANDLE_UNAVAILABLE
       (handle taken or permanently reserved — no state distinction to caller)
     NOT EXISTS → continue

  3. Create ix_ids/{canonical_handle}:
       ix_id                = canonical_handle
       owner_account_id     = account_id        (server-resolved; never client-supplied)
       ix_id_state          = ACTIVE
       ix_id_state_version  = 0
       created_at           = now()

  4. Create ix_ids/{canonical_handle}/ix_id_state_events/{event_id}:
       operation_type                = REGISTRATION
       account_id                    = account_id
       from_ix_id_state              = null
       to_ix_id_state                = ACTIVE
       prior_ix_id_state_version     = null
       resulting_ix_id_state_version = 0
       operation_id                  = request.operation_id
       occurred_at                   = now()
       actor                         = CONTROLLER

  5. Update accounts/{account_id}:
       owned_ix_id = canonical_handle

  6. Write holder_operation_receipts/{operation_id}
     (target_ix_id = canonical_handle; result_ix_id_state_version = 0; is_noop = false)

COMMIT
```

Two concurrent claims for the **same handle** contend on steps 2–3.
Two concurrent claims for **different handles by the same account** contend on steps 1 + 5.
In all cases exactly one transaction commits.

---

## Part 5: Holder Authority Service

### 5.1 Service identity and networking

Two Cloud Run services implement the holder authority boundary:

```
Browser / Client
    │  Authorization: Bearer <firebase-id-token>
    ▼
LB: /api/holder/* → ixid-holder-backend → ixid-holder-edge NEG
                     (longer prefix takes precedence over /api/* rule)

ixid-holder-edge (Cloud Run)
    Ingress:  internal-and-cloud-load-balancing
    IAM:      allUsers → run.invoker
    SA:       ixid-holder-edge-runtime  (zero Firestore roles)
    Role:     Traffic handler. Enforces header hygiene. Forwards Firebase token.

    Header hygiene (enforced before constructing authority request):
        STRIP any inbound X-Serverless-Authorization header
        STRIP any inbound X-Ix-* headers
    Then forward:
        Authorization: Bearer <same firebase-id-token from client>
        X-Serverless-Authorization: Bearer <Google OIDC token, aud = authority service URL>
    │
    │  Cloud Run invocation checked against X-Serverless-Authorization
    ▼
ixid-holder-authority (Cloud Run, IAM-private)
    Ingress:  all
    IAM:      ixid-holder-edge-runtime → run.invoker
              NO allUsers binding
    SA:       ixid-holder-authority-runtime  (roles/datastore.user)
    Role:     Firebase token verification; account resolution; all authority operations.

    Authority-side invariants:
        Trusts Cloud Run invocation IAM (X-Serverless-Authorization verified by runtime)
        Independently verifies Firebase token from Authorization header
        Does NOT trust any application-level header as a pre-verified identity claim
```

**IAM-private, not network-private.** `ixid-holder-authority` uses `ingress: all` with
no `allUsers` binding. Its Cloud Run URL is reachable at the network level, but an
unauthenticated or unauthorized caller receives 403 at the Cloud Run invocation boundary
before any application code executes. No VPC egress or private networking is required.

**OIDC audience pinning.** The Google OIDC token generated by `ixid-holder-edge` and
placed in `X-Serverless-Authorization` must have its `aud` claim set to the canonical
Cloud Run service URL of `ixid-holder-authority`. Using a wildcard or omitting the
audience is not permitted.

**Two-token header protocol (frozen):**
- Client sends: `Authorization: Bearer <firebase-id-token>`
- Edge strips all inbound `X-Serverless-Authorization` and `X-Ix-*` headers.
- Edge generates its own service token with `aud = ixid-holder-authority service URL`.
- Edge forwards client's `Authorization` header unchanged.
- Authority verifies `X-Serverless-Authorization` (Cloud Run runtime) and `Authorization`
  (Firebase Admin SDK) independently.
- **Neither service logs either bearer token.**

**`ixid-holder-authority-runtime` is distinct from all other SAs:**
- `ixid-projection-runtime`: read-only; `datastore.viewer`
- `ixid-edge-runtime`: data-authority-free
- `ixid-holder-authority-runtime`: write authority; `datastore.user`

**URL map amendment:** New path rule `/api/holder/*` → `ixid-holder-backend` is added to
`ixid-url-map`. The longer prefix takes precedence over `/api/*` → `ixid-edge-backend`.
The existing rule and its `pathPrefixRewrite` are not modified.

**Cache and CORS policy (frozen):** All `/api/holder/*` responses must include:
```
Cache-Control: no-store
```
`ixid-holder-backend` must not have Cloud CDN enabled. No permissive cross-origin CORS.

### 5.2 Single authority class

All permitted holder operations are implemented in one class: `HolderAuthorityService`
inside `ixid-holder-authority`. No other endpoint may contain an alternative
implementation of Firebase token verification, account resolution, ownership checks,
idempotency enforcement, or audit event creation.

### 5.3 Holder read contract (authenticated; SUSPENDED-readable)

```
GET /api/holder/v0.1/workspace
```

Account state gate for this path:
- `ACTIVE` or `SUSPENDED` → allowed (200)
- `DISABLED` or `CLOSED` → 403

Returns `AuthenticatedHolderWorkspace`:

```json
{
  "account_id": "ix_8f3a...",
  "account_state": "ACTIVE",
  "account_state_version": 3,
  "ix_ids": [
    {
      "ix_id": "mariastacos",
      "ix_id_state": "ACTIVE",
      "ix_id_state_version": 7,
      "owner_account_id": "ix_8f3a..."
    }
  ]
}
```

Response header: `Cache-Control: no-store`.
This response must not be confused with or derived from the public projection.

### 5.4 Authority operation contracts

#### 5.4.1 `CREATE_ACCOUNT`

**Principle: current account state outranks replay semantics.**
An operation receipt from a prior successful call does not grant access after the account
has been suspended, disabled, or closed. State is re-verified at the moment of the call.

```
1. Verify Firebase ID token → 401 on failure or audience mismatch

2. Compute identity_key = hex(SHA-256(verified_iss + "\x00" + verified_sub))

3. Pre-transaction fast-path idempotency check (not authoritative):
   Read holder_operation_receipts/{operation_id}
   → different principal_identity_key → 422 IDEMPOTENCY_CONFLICT (safe to reject early)
   → exact full binding (same principal_identity_key + operation_type=CREATE_ACCOUNT
                          + target_ix_id=null + payload_fingerprint)
     → enter transaction (step 4)
   → NOT EXISTS → enter transaction (step 4)

4. BEGIN FIRESTORE TRANSACTION

   a. Re-read holder_operation_receipts/{operation_id}
      (TOCTOU guard — prevents concurrent same-operation-ID requests)

      NOT EXISTS → continue to step 4b

      EXISTS, exact full binding
        (same principal_identity_key + operation_type=CREATE_ACCOUNT
         + target_ix_id=null + payload_fingerprint):
          Read auth_identities/{identity_key}
              NOT FOUND → ABORT → 500
                (internal consistency: receipt exists but auth mapping is absent)
              FOUND, mapping.account_id != receipt.resolved_account_id → ABORT → 500
                (internal consistency: receipt and mapping disagree on account)
              FOUND, auth_identity_state == REVOKED → ABORT → 401
                (auth credential revoked; old receipt does not bypass revocation)
              FOUND, auth_identity_state == ACTIVE, account_id matches:
                  Read accounts/{receipt.resolved_account_id}
                  account_state == ACTIVE:
                      → ABORT transaction (read-only; no write)
                      → return current authoritative account snapshot, 200
                  account_state == SUSPENDED / DISABLED / CLOSED:
                      → ABORT transaction (no write)
                      → 403

      EXISTS, any field differs:
          → ABORT → 422 IDEMPOTENCY_CONFLICT

   b. Read auth_identities/{identity_key}

      NOT EXISTS → continue to step 4c (create new account)

      EXISTS, auth_identity_state == REVOKED → ABORT → 401

      EXISTS, auth_identity_state == ACTIVE:
          Read accounts/{existing_account_id}
          account_state == ACTIVE:
              → Write holder_operation_receipts/{operation_id}
                  (is_noop = true; resolved_account_id = existing_account_id)
              → COMMIT
              → return current authoritative account snapshot, 200
          account_state == SUSPENDED / DISABLED / CLOSED:
              → ABORT (no write, no receipt)
              → 403

   c. Generate account_id (ix_ + 128-bit URL-safe base64)

   d. Create auth_identities/{identity_key}
      (linking evidence fields; auth_identity_state = ACTIVE)

   e. Create accounts/{account_id}
      (account_state = ACTIVE, account_state_version = 0, owned_ix_id = null)

   f. Create accounts/{account_id}/account_events/{e1} (ACCOUNT_CREATED)

   g. Create accounts/{account_id}/account_events/{e2} (AUTH_IDENTITY_LINKED)

   h. Write holder_operation_receipts/{operation_id}
      (is_noop = false; resolved_account_id = new account_id; target_ix_id = null)

   COMMIT
   TRANSACTION CONFLICT → Firestore retries; on re-read, step 4b takes EXISTS path

5. Return account snapshot (201 for new account; 200 for existing account paths)
   Cache-Control: no-store
```

**Concurrent first-login race:** Two calls with different `operation_id`s, same Firebase UID.
Both compute the same `identity_key`. Transactions contend on `auth_identities/{identity_key}`
at steps 4b–4d. One wins. The other retries → step 4b reads EXISTS/ACTIVE → checks account
state → ACTIVE → writes a no-op receipt for the loser's `operation_id` → returns current
authoritative account snapshot (200). One account created. Both `operation_id`s consumed.

**Concurrent call with same operation_id:** Both pass pre-transaction receipt check (step 3).
One completes the transaction, writing the receipt. The other enters the transaction, re-reads
the receipt at step 4a (EXISTS, exact full binding) → re-reads auth identity and account →
returns current authoritative snapshot or 403. The receipt is never written twice.

#### 5.4.2 `REGISTER_IX_ID`

```
1. Verify Firebase ID token → 401 on failure

2. Resolve account_id via auth_identities lookup → 401 if absent or REVOKED

3. Read accounts/{account_id}
   NOT FOUND → 500 (internal consistency failure; log; alert)
   account_state == DISABLED or CLOSED → 403
   account_state == SUSPENDED → 403 (mutations denied; workspace read via §5.3)
   account_state == ACTIVE → proceed

4. Canonicalize handle input → 422 on invalid form

5. Check reserved handle list (§4.2) → 422 if blocked

6. Check idempotency (§5.6) — BEFORE handle-existence and owned-IX-ID checks
   Receipt absent → continue
   Exact full binding (same principal_identity_key + operation_type=REGISTER_IX_ID
                        + target_ix_id=canonical_handle + payload_fingerprint):
       → enter transaction (step 9); receipt authority precedes state checks because
         the prior commit itself created the handle and set owned_ix_id; checking those
         first would incorrectly deny a valid replay with 409 HANDLE_UNAVAILABLE
   Same operation_id, any field differs → 422 IDEMPOTENCY_CONFLICT

   **The handle-existence and owned-IX-ID checks in steps 7–8 are skipped on the
   exact-receipt path.** They apply only when no receipt exists (new operation).**

7. Read ix_ids/{canonical_handle} (pre-transaction fast-path; skipped if step 6 found exact receipt)
   EXISTS (any state) → 409 HANDLE_UNAVAILABLE
   NOT EXISTS → continue

8. Pre-transaction owned_ix_id fast-path check (skipped if step 6 found exact receipt)
   non-null → 409 HANDLE_UNAVAILABLE (account already owns an IX ID)
   null → continue

9. BEGIN FIRESTORE TRANSACTION (§4.5 — the authoritative gate)

   a. Re-read holder_operation_receipts/{operation_id}
      (authoritative idempotency gate — receipt checked before registration state)

      NOT EXISTS → continue to step 9b

      EXISTS, exact full binding (same principal_identity_key + operation_type=REGISTER_IX_ID
                                   + target_ix_id=canonical_handle + payload_fingerprint):
          Verify receipt.resolved_account_id == current account_id
              → mismatch → ABORT → 500 (internal consistency: receipt linked to different account)
          Read accounts/{account_id}
          account_state != ACTIVE:
              → ABORT transaction (no write)
              → 403
          account_state == ACTIVE:
              Read ix_ids/{canonical_handle}
              NOT FOUND:
                  → ABORT → 500 (internal consistency: receipt exists but IX ID document absent)
              owner_account_id != account_id:
                  → ABORT → 500 (internal consistency: IX ID owned by different account)
              FOUND, ownership consistent:
                  → ABORT transaction (read-only; no write)
                  → return complete current authoritative ix_ids snapshot, 200

      EXISTS, any field differs:
          → ABORT → 422 IDEMPOTENCY_CONFLICT

   b. Re-read accounts/{account_id}
      Verify account_state == ACTIVE (TOCTOU guard)
      Verify owned_ix_id == null (TOCTOU guard)

   c. Re-read ix_ids/{canonical_handle}
      EXISTS (any state) → ABORT → 409 HANDLE_UNAVAILABLE (TOCTOU guard)

   d. Atomic claim: steps 3–6 from §4.5
   COMMIT
   TRANSACTION CONFLICT → 409 HANDLE_UNAVAILABLE (caller must re-read and retry)

10. Return current authoritative snapshot at resulting_ix_id_state_version = 0 (201)
    Cache-Control: no-store
```

**Replay semantics:** A matching receipt proves that the operation already committed and
prevents reapplication. It is not a cached response body. After current authority is
revalidated inside the transaction, the service reads and returns the current authoritative
state of what the original operation created. A replay of a CREATE_ACCOUNT + REGISTER_IX_ID
sequence correctly returns `owned_ix_id = alice` on the CREATE_ACCOUNT replay, not the
stale `owned_ix_id = null` value that existed when the account was first created.

**Note on revision semantics:** v0.1 has no operations that mutate existing IX ID state.
`REGISTER_IX_ID` creates a document that does not yet exist; there is no prior
`ix_id_state_version` to compare against. Stale-revision enforcement belongs to the
first future milestone that mutates existing holder state (Part 10).

### 5.5 Denial responses

**v0.1 REGISTER_IX_ID registration denial:**

```
409 HANDLE_UNAVAILABLE
```

A handle that exists in ANY state — ACTIVE, SUSPENDED, or TOMBSTONED — returns the
same 409 HANDLE_UNAVAILABLE. The caller cannot distinguish among those states.
"Not found" for REGISTER_IX_ID is not an error; it is the eligible-for-creation path.

**v0.1 general denial:**

```
403 ACCESS_DENIED
```

For account state failures: DISABLED, CLOSED, or SUSPENDED (for mutations).
Reason is not distinguished externally; internal reason codes are written to audit events.

**Future milestone — existing-state mutation denial (Part 10):**

```
403 NOT_FOUND_OR_NOT_AUTHORIZED
```

Reserved for future operations that mutate existing holder state (profile management,
payment route, etc.). This code is **not used in v0.1**. It will apply when an
authenticated account attempts to mutate an IX ID it does not own, or one that
does not exist.

**Denial evidence — zero authoritative Firestore writes:**

Denied calls must produce **zero writes to any authoritative Firestore collection**
(`accounts`, `account_events`, `auth_identities`, `holder_operation_receipts`,
`ix_ids`, `ix_id_state_events`). They must not append lifecycle events or receipts.

Denial reasons may be emitted as structured operational or security **logs** (a
non-authoritative logging sink such as Cloud Logging), but must never be written
as Firestore records that callers or adversaries could manufacture through repeated
denied requests. If persistent denial-event storage is ever needed, it requires its
own bounded, rate-controlled, non-authority-collection design.

**Internal reason codes (structured log fields only; never returned to client):**

| Code | Meaning |
|---|---|
| `HANDLE_TAKEN` | `ix_ids` document EXISTS at time of REGISTER_IX_ID |
| `HANDLE_TOMBSTONED` | specifically TOMBSTONED (for internal log detail) |
| `ACCOUNT_OWNS_HANDLE` | `owned_ix_id` non-null; one-per-account invariant |
| `ACCOUNT_NOT_ACTIVE` | account not ACTIVE for a mutation |
| `ACCOUNT_NOT_READABLE` | account DISABLED or CLOSED |
| `ACCOUNT_SUSPENDED_AFTER_RECEIPT` | receipt exists but account now non-ACTIVE (replay denied) |
| `AUTH_IDENTITY_REVOKED_AFTER_RECEIPT` | receipt exists but auth mapping now REVOKED |

### 5.6 Idempotency

Every operation request must include a caller-supplied `operation_id` (UUID).

| Operation | `target_ix_id` | `payload_fingerprint` | `result_ix_id_state_version` |
|---|---|---|---|
| `CREATE_ACCOUNT` | null | `SHA-256(identity_key)` | null |
| `REGISTER_IX_ID` | canonical handle | `SHA-256(canonical_handle)` | 0 |

**Exact full binding** — what constitutes a match:

| Operation | Fields that must all agree |
|---|---|
| `CREATE_ACCOUNT` | `principal_identity_key` + `operation_type=CREATE_ACCOUNT` + `target_ix_id=null` + `payload_fingerprint` |
| `REGISTER_IX_ID` | `principal_identity_key` + `operation_type=REGISTER_IX_ID` + `target_ix_id=canonical_handle` + `payload_fingerprint` + `receipt.resolved_account_id == current account_id` |

Matching rules when a receipt exists for a given `operation_id`:

| Condition | Response |
|---|---|
| Exact full binding (all fields agree; resolved_account_id consistent) | Revalidate current auth/account authority inside transaction; return current authoritative snapshot or 403. Zero Firestore writes. |
| `resolved_account_id` disagrees with current account_id | 500 internal consistency error. No mutation. |
| Same `operation_id`, any other field differs | 422 IDEMPOTENCY_CONFLICT. No mutation. |

**A matching receipt proves prior commit and prevents reapplication. It is not a
cached response body.** After current authority is revalidated (auth identity active,
account state permissive), the service reads and returns the current authoritative
state of what the original operation created.

The idempotency receipt is written inside the same Firestore transaction as the mutation.
For `CREATE_ACCOUNT` no-op paths, the receipt is written inside the transaction that reads
the existing mapping and account state (§5.4.1 step 4b).

### 5.7 v0.1 permitted operations

| Operation | Creates |
|---|---|
| `CREATE_ACCOUNT` | `auth_identities/{key}` + `accounts/{id}` + events + receipt |
| `REGISTER_IX_ID` | `ix_ids/{handle}` + state event + updates `accounts.owned_ix_id` + receipt |

v0.1 contains no operation that mutates an existing IX ID document after registration and no general-purpose holder-state update operation. The `owned_ix_id` sentinel write in `REGISTER_IX_ID` is a one-time creation-time mutation; it is not a general mutation of existing holder state.

### 5.8 Direct-Firestore authority invariant

Browser and Firebase-authenticated clients must not be able to read or write any
Holder Authority collection directly. All holder reads and writes must flow through
`ixid-holder-edge` → authenticated `ixid-holder-authority`.

Firestore Security Rules must deny browser/client access to all of the following:

```
accounts/{account_id}                           — no direct client reads or writes
accounts/{account_id}/account_events/*          — no direct client reads or writes
auth_identities/{identity_key}                  — no direct client reads or writes
holder_operation_receipts/{operation_id}        — no direct client reads or writes
ix_ids/{ix_id}                                  — no direct client reads or writes
ix_ids/{ix_id}/ix_id_state_events/*             — no direct client reads or writes
```

`ix_ids` has no client read exception. Public read access to IX ID documents is
served exclusively through the frozen server-side projection path (`ixid-projection`
with `datastore.viewer`), which is a server SA read — not a client SDK read.
Direct client reads of `ix_ids` via the Firestore SDK are denied by Security Rules
even for authenticated Firebase users.

The emulator gate must prove both READ and WRITE denial for authenticated and
unauthenticated clients on each collection above. Write-only denial tests are
insufficient.

The emulator gate must prove, for each collection above, that both:
- An **unauthenticated** direct Firestore client request is denied
- A **Firebase-authenticated** client request (any authenticated user) is also denied

Not just `ix_ids` — every authority collection listed here must be covered.

---

## Part 6: Falsification Attempts

New or substantially revised in revision 5 are marked ★.

---

### F-1: Concurrent handle claim

**Attack:** Two authenticated sessions simultaneously register `alice`.

**Model answer:** Both transactions contend on `ix_ids/alice` at step 9b–9d.
Exactly one creates the document; the other aborts → 409 HANDLE_UNAVAILABLE.

**Verification:** Test must prove exactly one winner and one 409, no partial state.

---

### F-2: Client-supplied account injection

**Attack:** Request body contains `{"owner_account_id": "victim_account_id"}`.

**Model answer:** `account_id` is resolved solely from the verified token via
`auth_identities` lookup. Request body values are never used for identity.

**Verification:** Tests must prove `owner_account_id` in Firestore equals server-resolved
value regardless of request body contents.

---

### F-3: Handle claim against already-owned handle

**Attack:** Account B attempts to register `alice`, already owned by Account A
(any ix_id_state: ACTIVE, SUSPENDED, or TOMBSTONED).

**Model answer:** Step 6/9b reads `ix_ids/alice`, finds EXISTS → 409 HANDLE_UNAVAILABLE.
The response is identical regardless of which state the handle is in. Account B cannot
determine Account A's ownership or the handle's state from the error response.

**Verification:** Tests must cover all three existing states and confirm identical 409
HANDLE_UNAVAILABLE responses with zero writes in each case.

---

### ★ F-3b: Case normalization bypass

**Attack:** `alice` is taken. Attacker registers `Alice`, `ALICE`, or `aliCe`.

**Model answer:** Step 4 canonicalization is server-side before any lookup.
All three canonicalize to `alice` → step 6 EXISTS → 409 HANDLE_UNAVAILABLE.

**Verification:** Tests must prove non-canonical forms of a taken handle are rejected.

---

### ★ F-5: Operation ID reuse with different payload

**Attack:** `operation_id=abc` with fingerprint H1 succeeds. Same `operation_id=abc`
then sent with fingerprint H2.

**Model answer:** Receipt exists; fingerprint mismatch → 422 IDEMPOTENCY_CONFLICT.
Nothing written.

**Verification:** Test must prove same operation_id with different fingerprint returns
422 and commits nothing.

---

### ★ F-5b: Legitimate idempotency retry

**Attack:** `operation_id=abc` succeeds. Network failure; retry with same id and payload.

**Model answer:** Receipt found; all fields match; account still ACTIVE → return committed
snapshot (200). No second state transition. No second `ix_id_state_events` record.

**Verification:** Retry test must prove no additional writes on matched retry.

---

### F-6: TOMBSTONED handle reclaim

**Attack:** Account CLOSED; handle becomes TOMBSTONED. Account B tries to register it.

**Model answer:** Step 6/9b: EXISTS (TOMBSTONED) → 409 HANDLE_UNAVAILABLE.
Identical external response to ACTIVE or SUSPENDED handle. Permanent reservation is opaque.

**Verification:** Seeded TOMBSTONED fixture. Test must prove the handle cannot be claimed.

---

### F-7: Session valid after account DISABLED or CLOSED

**Attack:** Account DISABLED or CLOSED. Firebase token still valid.

**Model answer:** §3.2 checks account_state; DISABLED/CLOSED → 403 independent of token validity.

**Verification:** Seeded DISABLED/CLOSED fixture. Valid token must be denied.

---

### ★ F-9: Full TOCTOU inside transaction

**Attack:** Concurrent actions between pre-transaction checks and the transaction change
account_state, owned_ix_id, IX ID existence, or the idempotency receipt.

**Model answer:** Transaction re-reads receipt (step 9c / §5.4.1 step 4a), account state,
owned_ix_id, and ix_ids existence inside the atomic boundary. Any discrepancy → abort → 409.

**Verification:** Test must prove a mutation whose pre-transaction checks passed but whose
underlying state changed concurrently is rejected with no partial write.

---

### ★ F-10: Direct Firestore write/read bypasses authority

**Attack variants:**
- Client forges `owned_ix_id = null` on their own `accounts` document to clear a
  constraint and register a second IX ID.
- Client forges an `auth_identities` mapping to claim another account's identity.
- Client forges or reads an `holder_operation_receipts` entry to inspect or replay an
  operation.
- Client writes directly to `ix_ids` to override suspension or state.
- Client reads `account_events` or `ix_id_state_events` to enumerate internal audit trails.

**Model answer:** Firestore Security Rules (§5.8) deny all client reads and writes to
every Holder Authority collection: `accounts`, `account_events`, `auth_identities`,
`holder_operation_receipts`, `ix_ids`, `ix_id_state_events`. The write-authority SA
(`ixid-holder-authority-runtime`) is the only principal permitted to write.

**Verification:** Emulator Security Rules tests must prove both unauthenticated and
Firebase-authenticated client requests are denied on each of these collections.
"Only `ix_ids`" tests are insufficient; all authority collections must be covered.

---

### ★ F-11: Concurrent first-login — both operation IDs consumed

**Attack:** Two simultaneous CREATE_ACCOUNT calls with different operation IDs for the
same Firebase UID.

**Model answer:** Both compute the same `identity_key`. Transactions contend at step 4b–4d.
One wins. The other retries → step 4b reads EXISTS/ACTIVE → checks account state → ACTIVE
→ writes no-op receipt for loser's `operation_id` (is_noop = true) → returns snapshot (200).
One account created. Both `operation_id`s consumed.

**Verification:** Test must prove exactly one `accounts` document, one `auth_identities`
document, and two receipts (one is_noop = false, one is_noop = true). Neither receipt can
be reused with a different fingerprint.

---

### ★ F-12: Same-account second IX ID registration

**Attack:** Account with `owned_ix_id = "alice"` attempts to register `"bob"`.

**Model answer:** Step 9a re-reads `accounts/{account_id}`, finds `owned_ix_id = "alice"`
(non-null) → abort → 409 HANDLE_UNAVAILABLE. Single document contention; no collection scan.

**Verification:** Test must prove no partial state is committed to any collection.

---

### ★ F-13: Direct authority invocation without authorized edge identity

**Attack:** Attacker calls `ixid-holder-authority` directly with a valid Firebase token,
bypassing `ixid-holder-edge`.

**Model answer:** `ixid-holder-authority` has `ingress: all` but no `allUsers` binding.
Cloud Run checks the `X-Serverless-Authorization` OIDC token. Without valid
`ixid-holder-edge-runtime` credentials with the correct audience, the caller receives 403
at the Cloud Run invocation boundary before any application code executes.

**Verification:** Test that direct HTTPS call to `ixid-holder-authority`'s `.run.app` URL
without valid `ixid-holder-edge-runtime` credentials returns 403.

---

### ★ F-14: Spoofed inbound internal trust headers

**Attack:** Attacker forges `X-Serverless-Authorization` or `X-Ix-*` in their request
to `ixid-holder-edge`, hoping the edge passes them to the authority.

**Model answer:** Edge explicitly strips all inbound `X-Serverless-Authorization` and
`X-Ix-*` headers and constructs its own service token with `aud = authority service URL`.
Attacker-supplied headers cannot reach the authority.

**Verification:** Test that inbound forged headers are not forwarded; the authority's
invocation auth reflects only the edge's own credential.

---

### ★ F-15: Firebase project/issuer collision

**Attack:** A Firebase UID from `other-project` equals a UID from `ixid-prod`.
Attacker authenticates with `other-project` credentials to claim another user's IX identity.

**Model answer:** Two independent defenses. First: Firebase Admin SDK verifies `aud = ixid-prod`;
a token from `other-project` fails at step 1. Second: even if verification passed, the
`identity_key` digest uses the exact `iss` (which embeds the project ID), producing different
digests for different projects.

**Verification:** Unit test that identical UIDs with different `iss` values produce different
`identity_key` digests. Integration test that a token with wrong `aud` is rejected at verification.

---

### ★ F-16: Firebase UID case sensitivity

**Attack:** Firebase UIDs `AbC123` and `abc123` are distinct. If the system lowercased
subjects, they would collapse to one identity.

**Model answer:** The formula uses the exact verified `sub` without transformation.
`SHA-256(iss + "\x00" + "AbC123")` ≠ `SHA-256(iss + "\x00" + "abc123")`.

**Verification:** Unit test that the two identity_key values differ.

---

### ★ F-17: Holder response cached and served to second user

**Attack:** Shared CDN or edge cache serves one holder's workspace to a different client.

**Model answer:** All `/api/holder/*` responses include `Cache-Control: no-store`.
`ixid-holder-backend` has Cloud CDN disabled.

**Verification:** Integration test confirms `Cache-Control: no-store` on all holder responses.

---

### ★ F-18: Concurrent CREATE_ACCOUNT with same operation_id from same principal

**Attack:** Network retry causes two in-flight CREATE_ACCOUNT requests with the same
`operation_id` and same Firebase principal to overlap.

**Model answer:** Both pass the pre-transaction fast-path receipt check (step 3). One
completes the transaction, writing the receipt. The other enters the transaction, re-reads
the receipt at step 4a (EXISTS, exact match), verifies current account state → ACTIVE →
aborts the transaction (no second write). Returns current authoritative account snapshot (200).
The receipt is written exactly once.

**Verification:** Test that two concurrent same-operation-ID same-principal CREATE_ACCOUNT
calls result in exactly one receipt document, exactly one `accounts` document, and both
callers receiving the same snapshot.

---

### ★ F-19: CREATE_ACCOUNT replay after account suspension

**Attack:** Account exists and was ACTIVE at the time of a prior CREATE_ACCOUNT receipt.
The account is subsequently suspended. Client replays the same `operation_id` expecting
to receive the cached account snapshot.

**Model answer:** Step 4a (transaction) re-reads the receipt (EXISTS, exact match), re-reads
`auth_identities/{identity_key}` (ACTIVE, account_id matches), then reads
`accounts/{receipt.resolved_account_id}` → account_state == SUSPENDED → ABORT (no write)
→ 403. The cached receipt does not confer access after account state changes.

**Verification:** Seeded SUSPENDED account. Test that replaying a prior valid CREATE_ACCOUNT
operation_id returns 403 with zero Firestore writes. Analogous tests for DISABLED and CLOSED.

---

### ★ F-20: Concurrent same-operation-ID REGISTER_IX_ID

**Attack:** Network retry causes two in-flight REGISTER_IX_ID requests with the same
`operation_id` and same Firebase principal to overlap. Both pass the pre-transaction
idempotency check (step 7) before either commits.

**Model answer:** One transaction commits, writing the receipt and creating the IX ID.
The other enters its transaction and re-reads the receipt at step 9a (EXISTS, exact match)
→ checks current account state → ACTIVE → aborts (no second write) → returns the prior
committed snapshot (200). The handle is created exactly once.

**Verification:** Test that two concurrent same-operation-ID same-principal REGISTER_IX_ID
calls result in exactly one `ix_ids` document, exactly one receipt, and both callers
receiving the same snapshot. Confirm step 9a, not steps 9b/9c, terminates the losing
transaction.

---

### ★ F-21: CREATE_ACCOUNT receipt bypass via revoked auth identity

**Attack:** A CREATE_ACCOUNT call succeeded; its receipt was written. Subsequently, the
`auth_identities/{identity_key}` entry is marked REVOKED (future operation, out of v0.1
scope). The attacker then replays the original `operation_id` expecting to receive the
account snapshot via the receipt's exact-match path.

**Model answer:** Step 4a (transaction, exact-receipt branch) re-reads
`auth_identities/{identity_key}` → `auth_identity_state == REVOKED` → ABORT → 401.
The auth mapping state outranks the operation receipt. An old receipt does not confer
access through a revoked credential.

**Verification:** Seeded REVOKED auth_identities fixture (set state directly via emulator;
revocation operation is not implemented). Test that replaying a valid receipt against a
REVOKED auth mapping returns 401 with zero Firestore writes.

---

### ★ F-22: Sequential REGISTER_IX_ID replay after committed response is lost

**Attack:** `REGISTER_IX_ID(op=abc, handle=alice)` commits: `ix_ids/alice` is created,
`accounts/{id}.owned_ix_id` is set, receipt `abc` is written. The network response is
lost before it reaches the client. The client retries with the same `operation_id=abc`,
same handle `alice`, same principal.

**Failure mode in pre-revision ordering:** Step 6 reads `ix_ids/alice` (now EXISTS) →
returns `409 HANDLE_UNAVAILABLE` before reaching the idempotency check at step 7. The
retry fails despite the operation having already committed successfully.

**Model answer (revision 7):** Step 6 checks idempotency **before** handle-existence.
Receipt `abc` is found. Exact full binding matches (including `resolved_account_id ==
current account_id`). Step 6 bypasses the handle and owned-IX-ID checks and routes
directly to the authoritative transaction. Transaction step 9a re-reads the receipt,
verifies account state → ACTIVE, reads current `ix_ids/alice` state → returns current
authoritative snapshot, 200. Exactly one `ix_ids` document exists. Exactly one receipt
exists. Exactly one `ix_id_state_events` record exists.

**Verification:** Test must prove:
- `REGISTER_IX_ID(op=abc, handle=alice)` commits (201)
- Retry `REGISTER_IX_ID(op=abc, handle=alice)` → 200, same authoritative snapshot
- Exactly one `ix_ids/alice` document
- Exactly one `holder_operation_receipts/abc` document
- Exactly one `ix_id_state_events` REGISTRATION record
- Zero additional Firestore writes on retry

This test is distinct from F-20, which covers two overlapping in-flight concurrent
requests. F-22 covers a fully committed first call followed by a sequential retry.

---

## Part 7: Exit Gate

The milestone is complete when all of the following loops are demonstrated against
authoritative persistence. Tests run against the Firestore emulator; the production gate
is a human-observed live smoke.

```
1.  CREATE_ACCOUNT — new Firebase auth principal
        ↓
    Single Firestore transaction:
        auth_identities/{identity_key} created (ACTIVE)
        accounts/{account_id} created (ACTIVE; owned_ix_id = null)
        Two account_events records (ACCOUNT_CREATED, AUTH_IDENTITY_LINKED)
        holder_operation_receipts/{operation_id} written (is_noop = false)
        ↓
    201: account_id, account_state = ACTIVE
    Cache-Control: no-store confirmed

2.  REGISTER_IX_ID with canonical handle gate-test-{uuid}
        ↓
    Atomic Firestore transaction:
        ix_ids/{handle} created (ACTIVE; ix_id_state_version = 0)
        owner_account_id = server-resolved account_id (not client-supplied)
        accounts/{account_id}.owned_ix_id = canonical handle
        Registration evidence: from=null, prior=null, to=ACTIVE, result=0
        holder_operation_receipts/{operation_id} written
        ↓
    201: complete authoritative snapshot
    Cache-Control: no-store confirmed

3.  Fresh authenticated session (same account, new Firebase token)
        ↓
    GET /api/holder/v0.1/workspace → 200
    Same account_id, same ix_id, same state_version
    Cache-Control: no-store confirmed

4.  Concurrent REGISTER_IX_ID — same handle, two sessions
        ↓
    Exactly one wins (201); other receives 409 HANDLE_UNAVAILABLE
    No partial state committed

5.  Non-canonical form of taken handle (e.g., "GATE-TEST-{uuid}")
        ↓
    409 HANDLE_UNAVAILABLE (identical to canonical form attempt)

6.  Unauthenticated request (any operation) → 401

7.  Handle claim against owned handle (ACTIVE, SUSPENDED, TOMBSTONED — one test each)
        ↓
    409 HANDLE_UNAVAILABLE
    Identical external response in all three cases
    Zero writes

8.  Operation ID replay — sequential retry (CREATE_ACCOUNT or REGISTER_IX_ID),
    response received before retry (no overlap with prior in-flight request)
        ↓
    Exact full receipt binding; account ACTIVE
    Current authoritative snapshot returned (200); no additional state transitions;
    no second ix_id_state_events or account_events record; zero Firestore writes

9.  Operation ID reuse — same operation_id, different payload fingerprint
        ↓
    422 IDEMPOTENCY_CONFLICT; zero writes

10. Concurrent CREATE_ACCOUNT race — same Firebase UID, two different operation IDs
        ↓
    Exactly one accounts document created
    Exactly one auth_identities document created
    Winner receives 201; loser receives 200 (existing snapshot)
    Exactly two receipts:
        winner: is_noop = false
        loser:  is_noop = true, resolved_account_id = winner's account_id
    Neither receipt reusable with different fingerprint → 422

11. Concurrent CREATE_ACCOUNT — same operation ID, same principal (F-18)
        ↓
    Exactly one receipt document written
    Exactly one accounts document created
    Both callers receive same snapshot

12. Same-account second registration attempt
        ↓
    Account already has owned_ix_id = "first-handle"
    REGISTER_IX_ID for "second-handle" → 409 HANDLE_UNAVAILABLE
    Zero writes

13. Seeded TOMBSTONED handle → REGISTER_IX_ID → 409 HANDLE_UNAVAILABLE

14. Seeded DISABLED account:
        All operations → 403
    Seeded CLOSED account:
        All operations → 403

15. Seeded SUSPENDED account:
        REGISTER_IX_ID → 403
        GET /workspace → 200 with account_state = SUSPENDED

16. CREATE_ACCOUNT replay after account suspension (F-19)
        ↓
    Prior valid receipt exists (is_noop = false)
    Account now SUSPENDED/DISABLED/CLOSED
    Replay with same operation_id → 403
    Zero Firestore writes

    CREATE_ACCOUNT replay with revoked auth identity (F-21)
        ↓
    Prior valid receipt exists (is_noop = false)
    auth_identities/{identity_key}.auth_identity_state = REVOKED (seeded fixture)
    Replay with same operation_id → 401
    Zero Firestore writes

17. Concurrent same-operation-ID REGISTER_IX_ID (F-20)
        ↓
    Two concurrent in-flight requests, same operation_id, same principal, same handle
    Exactly one ix_ids document created
    Exactly one receipt written
    Both callers receive same current authoritative snapshot
    Losing transaction terminated at step 9a (receipt re-read), not 9b/9c

18. Sequential REGISTER_IX_ID replay after committed response is lost (F-22)
        ↓
    First call commits: ix_ids/alice created, receipt written; response never received
    Retry with same operation_id, same principal, same handle (handle now EXISTS)
    Step 6 finds exact full receipt binding → bypasses steps 7–8
    Transaction step 9a re-reads receipt → account ACTIVE → returns current authoritative snapshot
    Result: 200 (not 409 HANDLE_UNAVAILABLE)
    Exactly one ix_ids document; exactly one receipt; exactly one ix_id_state_events record
    Zero additional Firestore writes

19. Direct authority invocation without edge service identity (F-13)
        ↓
    403 at Cloud Run invocation boundary

20. Direct Firestore read/write denied (F-10) — all authority collections
        ↓
    Security Rules emulator tests confirm, for each collection:
        accounts, account_events, auth_identities,
        holder_operation_receipts, ix_ids, ix_id_state_events
    Both READ and WRITE denied for:
        unauthenticated clients
        Firebase-authenticated clients (any authenticated user)
    Write-only tests are insufficient

21. Audit trail reconstruction from events only
        ↓
    ix_id_state_events alone reconstructs:
        who registered (account_id), when, resulting version = 0
        origin sentinel: from=null, prior=null
    account_events reconstructs ACCOUNT_CREATED + AUTH_IDENTITY_LINKED
    No authentication secret (raw UID, token) in any event record

22. Fresh load after each operation
        ↓
    Committed state visible; correct ix_id_state_version and owned_ix_id returned

23. Crash-and-retry resilience (both operations)
        ↓
    Simulate crash after Firestore commit, before response delivery
    Client retries with same operation_id + same payload
    Receipt found → current authoritative snapshot returned; no duplicate state transition

24. Firebase project issuer in identity_key (F-15 + F-16)
        ↓
    Unit: identical UIDs with different iss values → different identity_keys
    Unit: subjects "AbC123" and "abc123" → different identity_keys

25. Holder responses are no-store (F-17)
        ↓
    Cache-Control: no-store confirmed on:
        GET /workspace response
        CREATE_ACCOUNT response
        REGISTER_IX_ID response
```

---

## Part 8: Resolved Questions

**Q-C (CLOSED):** One IX ID per account in v0.1, enforced via `owned_ix_id` sentinel.

**Q-D (CLOSED):** CLAIMED eliminated; ACTIVE is the initial state at version 0.

**Q-E (CLOSED):** SUSPENDED accounts may read their workspace; all mutations denied.
DISABLED and CLOSED accounts denied all access, including reads.

**Q-F (CLOSED — v0.1 reserved set, not permanently complete):** Blocklist in §4.2
accepted as the v0.1 reserved set; additions require a code change.

---

## Part 9: Milestone Sequence Position

```
Public trust/presentation stack          FROZEN
Wildcard Public Ingress v0.1             FROZEN
    ↓
M1 — Holder Authority v0.1              THIS DOCUMENT (FROZEN)
    ↓
M2 — IX ID Registration / Onboarding v0.1
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

## Part 10: Mandatory Future Holder-Mutation Invariants

The following behaviors exist in the contract but are intentionally deferred to the
first future milestone that introduces an operation mutating existing holder state.
They must be proven at that milestone and must not be anticipated with dummy v0.1 operations.

**Stale-revision rejection:**
When an operation targets an existing IX ID document, the caller must supply an
`expected_ix_id_state_version`. If the authoritative version has advanced past the
expected version, the operation returns 409 with the current version. Client must
re-read before retrying.

**Cross-account mutation denial:**
An authenticated session for Account B may not mutate any field on an IX ID whose
`owner_account_id` is Account A. The external denial is `403 NOT_FOUND_OR_NOT_AUTHORIZED`
— identical to the response for "IX ID not found." Account B cannot infer ownership
from the error response. This uses the 403 code that is NOT used in v0.1.

**N → N+1 version transitions:**
Every mutation of existing holder state must increment `ix_id_state_version` by exactly 1
inside a Firestore transaction. The idempotency receipt's `result_ix_id_state_version`
must equal the committed version. Idempotency matching must include
`expected_ix_id_state_version` to prevent a prior receipt from being replayed against
a later revision.

These three invariants share a common implementation structure and must be implemented
together in the first mutation milestone.

---

Implementation does not begin before this freeze. The frozen contract is the authority. Implementation serves the contract; the contract does not change to accommodate implementation.
