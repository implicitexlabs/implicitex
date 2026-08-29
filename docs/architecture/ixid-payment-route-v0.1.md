# IX ID Payment Route Management v0.1
## Specification — DRAFT FOR REVIEW

Draft date: 2026-08-24
Status: **DRAFT** — awaiting independent review and human commit authorization

---

## Relationship to frozen documents

This specification **extends** the following frozen documents. It does not
modify them.

```
ixid-holder-authority-v0.1.md   — extends the authority service and
                                   holder_operation_receipts schema
ixid-firestore-schema-v0.1.md  — adds one field to ix_ids/{ix_id} and
                                   one new subcollection
ixid-identity-trust-architecture-v0.1.md — operates within I-1 through I-8;
                                   no architectural invariant is amended
```

The PAYMENT_ROUTE verification claim and wallet binding event schema in
`ixid-firestore-schema-v0.1.md §2 / §4` are the target state reached after
M4 (wallet ownership verification). M3 does not create PAYMENT_ROUTE
verification claims. M3 creates a PENDING_OWNERSHIP_PROOF route record that
M4 will promote into a full verification claim.

---

## Purpose

M3 gives an authenticated IX ID holder the ability to declare a USDC payment
route — a destination wallet address on Polygon — attached to their IX ID.

Declaration is not proof. An M3 route record in PENDING_OWNERSHIP_PROOF state
tells the system where the holder *claims* their wallet is. It does not prove
they control that wallet. The IX ID is not payable in M3. The payment-read
surface returns null until M4 (wallet ownership proof) elevates the route
to ACTIVE.

M3 is the first step in the chain:

```
M3: holder declares route   →   PENDING_OWNERSHIP_PROOF
M4: holder proves ownership →   ACTIVE (route + verification claim)
Payment layer reads ACTIVE route → USDC transfer becomes possible
```

---

## Part 1: Core Concepts

### 1.1 What a payment route is

A payment route associates an IX ID with one destination wallet address on
one network carrying one asset. In v0.1:

```
IX ID         mariastacos
Network       Polygon mainnet
Asset         native USDC (ERC-20, contract 0x3c499c...}
Destination   0x91de...  (EVM address, lowercase)
```

The IX ID is the stable identity. The route is the current routing target.
Per architectural invariant I-1, the route may change without changing the
identity. Route changes are always recorded as new route records; old records
are preserved permanently.

### 1.2 One active route per IX ID

At any point in time, an IX ID has at most one non-terminal route record:
the current route. Replacing the route supersedes the old record; creating a
new route after disabling also supersedes. There is no ambiguity about which
address to pay.

### 1.3 M3 fail-closed contract

An IX ID with a PENDING_OWNERSHIP_PROOF route is not payable. The public
payment-read surface returns `null` for any IX ID whose route has not been
elevated to ACTIVE by M4. The holder authority and projection service must
not expose a PENDING_OWNERSHIP_PROOF address to the payment layer under any
condition.

---

## Part 2: v0.1 Network / Asset Invariant

This invariant is frozen for v0.1. It may be amended only at a formal
architecture milestone.

```
Network:   Polygon mainnet (chain_id = 137)
Asset:     Native USDC — the Circle-issued ERC-20 USDC contract on Polygon
           (not bridged/wrapped USDC; not USDC.e; only the canonical Circle
           native USDC contract address as configured in the deployment
           environment)
Custody:   None — IX ID stores only the destination address; it never holds,
           controls, or exercises discretion over funds
Key material: None — no private key material ever enters the IX ID system
Fiat/card: Not supported in v0.1 or in any milestone visible from here
```

The USDC contract address for the canonical Circle native USDC on Polygon
mainnet must be sourced from the deployment environment configuration
(`USDC_CONTRACT_ADDRESS`) and cross-checked against the chain at service
startup. It must not be hardcoded in application logic.

---

## Part 3: Route Lifecycle

### 3.1 Route record states

```
PENDING_OWNERSHIP_PROOF
    The holder has declared a destination address. Wallet ownership proof
    has not yet been performed. The IX ID is not payable.
    Set on creation in M3. Persists until M4 ownership proof or supersession.

ACTIVE
    Destination address declared AND wallet ownership cryptographically
    proven (M4). The IX ID is payable. The verification claim for this
    route exists in verification_claims with status ACTIVE.
    Only the M4 ownership proof ceremony may set this state.

DISABLED
    The holder explicitly removed the route. Terminal in v0.1.
    The IX ID is not payable. A new route may be created (starting again
    at PENDING_OWNERSHIP_PROOF). No existing route record transitions to
    ACTIVE after being DISABLED.

SUPERSEDED
    This record was replaced by a newer route record of the same IX ID.
    Terminal. The record is preserved permanently for audit history.

REVOKED
    IX administrative action removed the route (trust/safety determination).
    Terminal. The record is preserved permanently.
```

### 3.2 State machine

```
[none]
    │  SET_PAYMENT_ROUTE (M3)
    ▼
PENDING_OWNERSHIP_PROOF
    │                      │                           │
    │  M4 ownership         │  SET_PAYMENT_ROUTE        │  DISABLE_PAYMENT_ROUTE
    │  proof ceremony       │  (replacement, M3)        │  (holder, M3)
    │                      │                           │
    ▼                      ▼                           ▼
  ACTIVE              SUPERSEDED                   DISABLED (terminal)
    │                  (terminal)
    │  SET_PAYMENT_ROUTE      │  DISABLE_PAYMENT_ROUTE    │  REVOKE (admin)
    │  (replacement, M3)      │  (holder, M3)              │
    │                         │                            ▼
    ▼                         ▼                         REVOKED (terminal)
SUPERSEDED                DISABLED
(terminal)                (terminal)
```

All terminal states are permanent. No record transitions out of SUPERSEDED,
DISABLED, or REVOKED. The record is preserved as append-only evidence.

### 3.3 Deletion policy

Route records are **never physically deleted**. Deletion is not an authorized
operation. The holder may disable a route (DISABLED), which prevents payment
routing. Historical records remain permanently for evidence reconstruction
(architectural invariant I-5).

### 3.4 Replacement (SET_PAYMENT_ROUTE on an existing current route)

Creating a new route when a current route already exists is an atomic
supersession operation:

```
BEGIN TRANSACTION
  1. Read current route record (must match expected_route_version)
  2. Create new route record (status = PENDING_OWNERSHIP_PROOF,
     route_version = prior_route_version + 1)
  3. Update prior record: status = SUPERSEDED, superseded_by = new record_id
  4. Write route_record_events for both transitions
  5. Write holder_operation_receipt for this operation_id
COMMIT
```

After replacement, the IX ID returns to PENDING_OWNERSHIP_PROOF regardless
of whether the prior route was ACTIVE. M4 must be re-performed for the
new address.

**Consequence:** Replacing an ACTIVE route revokes payment capability until
M4 is re-performed. The holder is responsible for this trade-off.

### 3.5 Behavior when an IX ID has no active route

An IX ID may have no current route record at all (never set), or a current
route in PENDING_OWNERSHIP_PROOF or DISABLED state. In all three cases:

- The public payment-read surface returns null.
- The IX ID is not payable by the ImplicitEx payment layer.
- The holder workspace returns the current route record (or indicates none).
- No error is returned — absent or non-ACTIVE routes are a valid state.

---

## Part 4: Ownership and Authority Boundary

### 4.1 Who may manage a route

An authenticated IX ID holder (ACTIVE account, ACTIVE IX ID) may:
- Set (create or replace) a payment route for their own IX ID
- Disable their current payment route

An IX ID holder may NOT:
- Manage the payment route of a different IX ID
- Bypass the M4 ownership proof to directly set status = ACTIVE
- Read another holder's pending route (pending routes are private to the holder)

The server resolves the `account_id` and `ix_id` from the verified Firebase ID
token via the auth_identities mapping. No client-supplied account or IX ID
identifier is accepted for identity resolution.

### 4.2 What M3 accepts without M4

M3 accepts the holder's self-declaration of a destination address. The service
validates:
- The address is a syntactically valid EVM hex address (0x + 40 hex chars)
- The chain is exactly Polygon mainnet (chain_id = 137)
- The asset is exactly native USDC

The service does NOT validate:
- That the holder controls the declared address (M4)
- That the address has ever received USDC (not required)
- That the address is not a smart contract (not validated in v0.1)

### 4.3 How M3 remains fail-closed without M4

The fail-closed contract is structural, not behavioral:

1. The `active_payment_route_claim_id` field on `ix_ids/{ix_id}` is set ONLY
   by M4. M3 operations may not write this field.

2. The public payment-read surface (served by ixid-projection) reads ONLY
   `active_payment_route_claim_id` to determine payability. If null, the IX
   ID is not payable.

3. The `PENDING_OWNERSHIP_PROOF` status is never served to the payment layer.
   Any code path that reaches the payment layer must check for ACTIVE status
   explicitly, not merely the presence of a route record.

4. The M4 milestone has sole authority to transition PENDING_OWNERSHIP_PROOF
   → ACTIVE. No M3 operation may perform this transition.

### 4.4 M4 authority boundary (declared, not implemented here)

M4 will:
- Accept a signed challenge from the holder's wallet (SIWE or equivalent)
- Verify the signature server-side using the declared destination address
- Create a `verification_claims/{claim_id}` record (claim_type = PAYMENT_ROUTE,
  evidence_type = ETH_SIGN_CHALLENGE, assurance_level = HIGH)
- Transition the route record from PENDING_OWNERSHIP_PROOF → ACTIVE
- Set `ix_ids/{ix_id}.active_payment_route_claim_id` to the new claim_id
- Set `ix_ids/{ix_id}.active_payment_route_address` to the lowercase address
- Write the wallet_binding_events evidence record
- All of the above in a single Firestore transaction

M4 design is out of scope for this document.

---

## Part 5: API Contract

### 5.1 Service routing

Payment route operations are holder-authenticated operations. They are routed
through the same two-tier service chain as M1/M2 holder operations:

```
Browser
    │  Authorization: Bearer <firebase-id-token>
    ▼
LB: /api/holder/* → ixid-holder-backend → ixid-holder-edge NEG
    │
    │  (edge strips inbound X-Serverless-Authorization / X-Ix-* headers;
    │   generates its own OIDC token for ixid-holder-authority)
    ▼
ixid-holder-authority (IAM-private Cloud Run)
    Verifies Firebase token + OIDC service token independently
    Performs all route operations
```

All /api/holder/* responses carry `Cache-Control: no-store`.

### 5.2 Authentication requirements (all endpoints)

Identical to M1/M2 (§3.2 of ixid-holder-authority-v0.1.md):
- Firebase ID token in `Authorization: Bearer` header; verified against ixid-prod
- Token must pass email_verified check (M2 activation requirement)
- Account must be ACTIVE
- IX ID must be ACTIVE and owned by the resolved account

A SUSPENDED account may read its current route (read-only; §5.3).
A SUSPENDED account may not perform SET_PAYMENT_ROUTE or DISABLE_PAYMENT_ROUTE.

### 5.3 `GET /api/holder/v0.1/payment-route`

Read the current route record for the authenticated holder's IX ID.

**Authorization:** ACTIVE or SUSPENDED account, ACTIVE IX ID.

**Request:** No body. `operation_id` not required for reads.

**Response 200 — route exists:**
```json
{
  "record_id": "pr_7a2f...",
  "ix_id": "mariastacos",
  "route_version": 1,
  "chain": "POLYGON_MAINNET",
  "asset": "USDC_NATIVE",
  "destination_address": "0x91de...",
  "status": "PENDING_OWNERSHIP_PROOF",
  "status_version": 0,
  "created_at": "2026-08-24T18:00:00Z",
  "operation_id": "a1b2-..."
}
```

**Response 200 — no route:**
```json
{
  "record_id": null,
  "ix_id": "mariastacos",
  "status": null
}
```

**Response 401:** Token missing, invalid, or account identity not established.
**Response 403:** Account DISABLED or CLOSED.

### 5.4 `POST /api/holder/v0.1/payment-route`

Create a new route or replace the current route.

**Authorization:** ACTIVE account, ACTIVE IX ID, account not SUSPENDED.

**Request body:**
```json
{
  "operation_id": "uuid-v4",
  "destination_address": "0x91de...",
  "chain": "POLYGON_MAINNET",
  "asset": "USDC_NATIVE",
  "expected_route_version": 0
}
```

`expected_route_version`:
- `0` when no current route exists (first-time creation)
- `N` (the current `route_version`) when replacing an existing route

**Response 201 — route created or replaced:**
```json
{
  "record_id": "pr_7a2f...",
  "ix_id": "mariastacos",
  "route_version": 1,
  "chain": "POLYGON_MAINNET",
  "asset": "USDC_NATIVE",
  "destination_address": "0x91de...",
  "status": "PENDING_OWNERSHIP_PROOF",
  "status_version": 0,
  "created_at": "2026-08-24T18:00:00Z"
}
```

**Response 200 — idempotent replay of prior committed operation.**

**Response 400:** Missing or malformed required fields.

**Response 401:** Token invalid or not recognized.

**Response 403:**
- Account DISABLED or CLOSED
- Account SUSPENDED (mutations not permitted)

**Response 409 — STALE_ROUTE_VERSION:**
```json
{ "error": "STALE_ROUTE_VERSION", "current_route_version": 2 }
```
Returned when `expected_route_version` does not match the current route's
`route_version`. Caller must re-read (GET) and resubmit.

**Response 422 — validation errors:**
```json
{ "error": "INVALID_ADDRESS" }       // not a valid EVM hex address
{ "error": "UNSUPPORTED_CHAIN" }     // chain ≠ POLYGON_MAINNET
{ "error": "UNSUPPORTED_ASSET" }     // asset ≠ USDC_NATIVE
{ "error": "IDEMPOTENCY_CONFLICT" }  // same operation_id, different payload
```

**Response 429:** Rate limit exceeded. Caller should back off.

### 5.5 `POST /api/holder/v0.1/payment-route/disable`

Disable the current route. The route transitions to DISABLED (terminal).

**Authorization:** ACTIVE account, ACTIVE IX ID, account not SUSPENDED.

**Request body:**
```json
{
  "operation_id": "uuid-v4",
  "expected_route_version": 1
}
```

`expected_route_version` must match the current route's `route_version`.

**Response 200 — route disabled:**
```json
{
  "record_id": "pr_7a2f...",
  "status": "DISABLED",
  "status_version": 1,
  "disabled_at": "2026-08-24T19:00:00Z"
}
```

**Response 409 — STALE_ROUTE_VERSION or NO_ACTIVE_ROUTE:**
```json
{ "error": "STALE_ROUTE_VERSION", "current_route_version": 2 }
{ "error": "NO_CURRENT_ROUTE" }
```

**Response 422:**
```json
{ "error": "IDEMPOTENCY_CONFLICT" }
{ "error": "ROUTE_ALREADY_TERMINAL" }  // route already DISABLED/REVOKED
```

### 5.6 Idempotency contract

All mutating operations (`SET_PAYMENT_ROUTE`, `DISABLE_PAYMENT_ROUTE`) require
a caller-supplied `operation_id` (UUID v4). The idempotency mechanism follows
the exact pattern established in ixid-holder-authority-v0.1.md §5.6 and uses
the existing `holder_operation_receipts/{operation_id}` collection.

New entries in the `operation_type` enum:

| Operation | `operation_type` | `target_ix_id` | `payload_fingerprint` |
|---|---|---|---|
| SET_PAYMENT_ROUTE | `SET_PAYMENT_ROUTE` | canonical handle | `SHA-256(canonical_handle + "\x00" + lowercase_address + "\x00" + chain + "\x00" + asset + "\x00" + str(expected_route_version))` |
| DISABLE_PAYMENT_ROUTE | `DISABLE_PAYMENT_ROUTE` | canonical handle | `SHA-256(canonical_handle + "\x00" + str(expected_route_version))` |

**Exact full binding for `SET_PAYMENT_ROUTE`:**
`principal_identity_key` + `operation_type=SET_PAYMENT_ROUTE` + `target_ix_id` +
`payload_fingerprint` + `resolved_account_id`

Matching rules are identical to M1/M2 (§5.6 of ixid-holder-authority-v0.1.md):
- Exact full binding → revalidate current auth/account authority inside
  transaction; return current authoritative route state (200)
- Same `operation_id`, any field differs → 422 IDEMPOTENCY_CONFLICT
- Different `resolved_account_id` → 500 internal consistency error

### 5.7 Stale-revision enforcement

Per the mandatory future holder-mutation invariants declared in Part 10 of
ixid-holder-authority-v0.1.md, all M3 mutating operations enforce:

- Caller supplies `expected_route_version` in the request.
- Inside the Firestore transaction, the current route's `route_version` is
  re-read. If it differs from `expected_route_version`, the transaction aborts
  → 409 STALE_ROUTE_VERSION with the current version in the response body.
- Callers must re-read and resubmit with the updated version. Blind retries
  are not permitted.

This is the v0.1 instantiation of the N→N+1 mutation invariant declared in
ixid-holder-authority-v0.1.md §Part 10.

---

## Part 6: Persistence Invariants

### 6.1 Schema additions

**6.1.1 New fields on `ix_ids/{ix_id}` (system-mutable)**

| Field | Type | Set by | Notes |
|---|---|---|---|
| `pending_route_record_id` | string or null | SET_PAYMENT_ROUTE (M3) | record_id of current PENDING_OWNERSHIP_PROOF record; null if none |
| `active_payment_route_claim_id` | string or null | M4 only | Already declared in frozen schema; remains null throughout M3 |
| `active_payment_route_address` | string or null | M4 only | Lowercase EVM address; null in M3; set by M4 when route becomes ACTIVE |

`pending_route_record_id` is cleared (set to null) when the pending route
transitions to any terminal state (ACTIVE, DISABLED, REVOKED, SUPERSEDED).
Clearing and the route transition must occur in the same Firestore transaction.

**6.1.2 New subcollection: `ix_ids/{ix_id}/payment_route_records/{record_id}`**

`record_id` is an IX-generated opaque identifier (e.g., `pr_` + 128-bit
URL-safe base64).

**Immutable after creation:**

| Field | Type | Notes |
|---|---|---|
| `record_id` | string | Document key; IX-generated |
| `ix_id` | string | The IX ID handle |
| `owner_account_id` | string | Server-resolved account_id; never client-supplied |
| `route_version` | integer | 1-based; incremented per creation/replacement |
| `chain` | enum | `POLYGON_MAINNET` |
| `asset` | enum | `USDC_NATIVE` |
| `destination_address` | string | Lowercase EVM hex address |
| `created_at` | timestamp | |
| `creation_operation_id` | string | Idempotency key for the creation operation |
| `supersedes_record_id` | string or null | record_id of the route this replaces; null if first |

**Lifecycle-mutable (via legal transitions only):**

| Field | Type | Notes |
|---|---|---|
| `status` | enum | `PENDING_OWNERSHIP_PROOF` \| `ACTIVE` \| `DISABLED` \| `SUPERSEDED` \| `REVOKED` |
| `status_version` | integer | Starts at 0; incremented by exactly 1 per transition |
| `status_changed_at` | timestamp | Most recent transition time |
| `superseded_by_record_id` | string or null | Set when SUPERSEDED |
| `disabled_at` | timestamp or null | |
| `revoked_at` | timestamp or null | |
| `revocation_reason` | string or null | Admin-supplied; never client-visible |

No document in this subcollection may be physically deleted.

**6.1.3 New subcollection: `ix_ids/{ix_id}/payment_route_records/{record_id}/route_record_events/{event_id}`**

Append-only. One document per lifecycle transition.

| Field | Type |
|---|---|
| `event_id` | string (UUID) |
| `record_id` | string |
| `ix_id` | string |
| `operation_id` | string or null (null for admin-initiated events) |
| `operation_type` | enum: `SET_PAYMENT_ROUTE` \| `DISABLE_PAYMENT_ROUTE` \| `M4_PROOF_COMPLETE` \| `ADMIN_REVOKE` \| `SUPERSEDED_BY_REPLACEMENT` |
| `from_status` | enum or null (null for CREATION event) |
| `to_status` | enum |
| `prior_status_version` | integer or null (null for CREATION) |
| `resulting_status_version` | integer |
| `actor` | enum: `CONTROLLER` \| `IX_ADMIN` \| `IX_SYSTEM` |
| `occurred_at` | timestamp |
| `reason` | string or null |

No document in this collection may be updated or deleted.

**6.1.4 `holder_operation_receipts` additions**

The `operation_type` enum is extended to include:
- `SET_PAYMENT_ROUTE`
- `DISABLE_PAYMENT_ROUTE`

No schema change is required to the `holder_operation_receipts/{operation_id}`
document structure; only the operation_type enum is extended.

### 6.2 Atomicity requirements

**SET_PAYMENT_ROUTE (new route, no prior):**
```
BEGIN TRANSACTION
  1. Re-read holder_operation_receipts/{operation_id} (idempotency gate)
  2. Verify account state == ACTIVE, ix_id_state == ACTIVE
  3. Verify no current route exists OR expected_route_version == 0
  4. Create payment_route_records/{new_record_id}
     (status = PENDING_OWNERSHIP_PROOF, status_version = 0, route_version = 1)
  5. Create route_record_events/{event_id} (CREATION event, from_status = null)
  6. Update ix_ids/{ix_id}: pending_route_record_id = new_record_id
  7. Write holder_operation_receipts/{operation_id}
COMMIT
```

**SET_PAYMENT_ROUTE (replacement of existing route):**
```
BEGIN TRANSACTION
  1. Re-read holder_operation_receipts/{operation_id} (idempotency gate)
  2. Verify account state == ACTIVE, ix_id_state == ACTIVE
  3. Re-read current route record; verify route_version == expected_route_version
  4. Create payment_route_records/{new_record_id}
     (status = PENDING_OWNERSHIP_PROOF, status_version = 0,
      route_version = prior_route_version + 1,
      supersedes_record_id = prior_record_id)
  5. Create route_record_events/{event_id} for new record (CREATION)
  6. Update prior record: status = SUPERSEDED, status_version++,
     superseded_by_record_id = new_record_id
  7. Create route_record_events/{event_id} for prior record (SUPERSEDED_BY_REPLACEMENT)
  8. Update ix_ids/{ix_id}: pending_route_record_id = new_record_id
  9. Write holder_operation_receipts/{operation_id}
COMMIT
```

**DISABLE_PAYMENT_ROUTE:**
```
BEGIN TRANSACTION
  1. Re-read holder_operation_receipts/{operation_id} (idempotency gate)
  2. Verify account state == ACTIVE
  3. Re-read current route record; verify route_version == expected_route_version
  4. Verify route status is not already terminal
  5. Update route record: status = DISABLED, status_version++, disabled_at = now()
  6. Create route_record_events/{event_id} (DISABLE_PAYMENT_ROUTE)
  7. Update ix_ids/{ix_id}: pending_route_record_id = null
  8. Write holder_operation_receipts/{operation_id}
COMMIT
```

All of the above are single Firestore transactions. No partial writes are
permitted. A transaction conflict on any step causes a full abort and retry
(same operation_id on retry is idempotent via step 1).

### 6.3 Concurrency and version conflicts

Two concurrent SET_PAYMENT_ROUTE calls for the same IX ID contend on the
`pending_route_record_id` field and on the prior route record's `status_version`
inside the transaction. One wins; the other retries. On retry, if the
`expected_route_version` no longer matches (because the winning transaction
advanced it), the retry returns 409 STALE_ROUTE_VERSION. The caller must
re-read and resubmit.

If both calls carry the same `operation_id`, the idempotency gate at step 1
prevents double-write. Exactly one receipt is written.

### 6.4 Denial — zero authoritative writes

A denied operation (401, 403, 409 STALE_ROUTE_VERSION, 422) must produce
zero writes to any authoritative Firestore collection. Denial reasons may be
emitted to Cloud Logging (non-authoritative) but must not be written to
Firestore records.

---

## Part 7: Payment-Read Surface

### 7.1 What the payment layer needs

The ImplicitEx sender/payment flow requires exactly one piece of information
per IX ID to construct a USDC payment:

```
{
  "ix_id": "mariastacos",
  "payable": true,
  "destination_address": "0x91de...",
  "chain": "POLYGON_MAINNET",
  "asset": "USDC_NATIVE",
  "payment_route_claim_id": "vc_4f2a..."
}
```

If `payable: false`, the payment is not attempted. No fallback to a pending
address is permitted.

### 7.2 Public route endpoint (served by ixid-projection)

The projection service (`ixid-projection`, read-only SA with `datastore.viewer`)
serves public identity reads including payment route information.

```
GET /api/v0.1/identity/{ix_id}/route
```

No authentication required (public endpoint).

**Response 200 — payable:**
```json
{
  "ix_id": "mariastacos",
  "payable": true,
  "destination_address": "0x91de...",
  "chain": "POLYGON_MAINNET",
  "asset": "USDC_NATIVE",
  "payment_route_claim_id": "vc_4f2a..."
}
```

**Response 200 — not payable (any reason: no route, pending, disabled, suspended):**
```json
{
  "ix_id": "mariastacos",
  "payable": false
}
```

The projection reads `ix_ids/{ix_id}.active_payment_route_address` and
`active_payment_route_claim_id`. If either is null, the response is
`payable: false`. The projection does NOT read `payment_route_records` or
`pending_route_record_id`. The fail-closed contract is enforced structurally:
the projection has no code path to a PENDING address.

**Response 404:** IX ID not found or TOMBSTONED.

**Response 200 with payable: false for SUSPENDED IX ID** — suspension does not
change the response code; it simply results in a null `active_payment_route_address`.

### 7.3 No payment execution in M3

M3 defines the route declaration and the public read surface. It does not:
- Execute USDC transfers
- Collect fees
- Write `ix_transaction_refs` records
- Interact with the Polygon RPC or any on-chain endpoint

### 7.4 Caching policy

The route endpoint carries:
```
Cache-Control: public, max-age=30, s-maxage=30
```

A 30-second cache is acceptable for the payment route because:
- Route changes are infrequent and deliberate
- A 30-second stale window is operationally acceptable for payment routing
- Longer caches risk routing payments to a superseded address

The projection must not cache permanently or set max-age beyond 60 seconds.

---

## Part 8: Security Requirements

### 8.1 Address validation

The `destination_address` field must pass all of the following checks
before the operation proceeds:

1. Must be a string.
2. Must match the pattern `^0x[0-9a-fA-F]{40}$` (EIP-55 format accepted).
3. Must be stored in lowercase form (`addr.toLowerCase()`).
4. Must not be the zero address (`0x0000...0000`).
5. Must not be a known burn address (the zero address is the primary burn
   address; additional burn addresses may be added via configuration).

Failure on any check: 422 INVALID_ADDRESS. No partial validation.

The service does NOT validate:
- That the address is a valid checksummed EIP-55 address (accepted but not required)
- That the address is an EOA vs. smart contract
- That the address has ever transacted

### 8.2 Chain and asset validation

`chain` must be exactly `POLYGON_MAINNET`. Any other value: 422 UNSUPPORTED_CHAIN.

`asset` must be exactly `USDC_NATIVE`. Any other value: 422 UNSUPPORTED_ASSET.

Both values are validated server-side from the request body. Client-supplied
values are never trusted to configure network or asset routing.

### 8.3 Authorization checks

1. Firebase ID token must verify with `aud = ixid-prod` (same as M1/M2).
2. `email_verified` claim must be true on the token (M2 activation requirement).
3. `auth_identities/{identity_key}` must exist and be ACTIVE.
4. `accounts/{account_id}.account_state` must be ACTIVE for mutations.
5. `accounts/{account_id}.owned_ix_id` must equal the IX ID being operated on.
6. `ix_ids/{ix_id}.ix_id_state` must be ACTIVE.

Cross-account mutation denial: an account attempting to operate on an IX ID
it does not own receives `403 NOT_FOUND_OR_NOT_AUTHORIZED` (the M1-reserved
code for cross-ownership denials). This is identical to the response for "IX
ID not found." The caller cannot infer ownership from the error response.

### 8.4 Rate limiting

Route mutations are low-frequency operations. The holder authority must apply
a per-account rate limit for SET_PAYMENT_ROUTE and DISABLE_PAYMENT_ROUTE. The
specific limit is an implementation parameter, but the contract requires:

- At minimum: 10 mutations per account per hour.
- Rate-exceeded response: 429 with `Retry-After` header.
- Rate limit state must be maintained server-side; client claims are not trusted.

### 8.5 No secret or key material

No private key material, mnemonic, or signing credential ever enters the
holder authority in M3. M3 accepts only the destination address — not any
proof of control. Key material belongs entirely to M4.

### 8.6 Logging and redaction

**Must be logged (structured Cloud Logging):**
- Operation type, IX ID handle, account_id digest (opaque), outcome code,
  timestamp, new route_version

**Must NOT be logged:**
- Firebase ID token or any bearer token
- Raw Firebase UID (the `sub` claim)
- Destination address (logged as `address_hash = SHA-256(lowercase_address)`)
- Any field from the request body beyond operation type and routing fields

Logging the address hash rather than the raw address enables correlation
across operations without permanently logging a financial address in Cloud Logging.

### 8.7 Firestore Security Rules

The new subcollection `payment_route_records` and its `route_record_events`
subcollection must be covered by the same client-denial Security Rules as all
other holder authority collections:

```
match /ix_ids/{ix_id}/payment_route_records/{recordId} {
  allow read, write: if false;
}
match /ix_ids/{ix_id}/payment_route_records/{recordId}/route_record_events/{eventId} {
  allow read, write: if false;
}
```

All reads and writes must flow through the holder authority service. No client
SDK access is permitted for any document in these subcollections, even for
authenticated Firebase users.

---

## Part 9: Explicit Non-Goals (v0.1)

```
NOT in M3:
  SIWE / wallet ownership proof                → M4
  Wallet challenge issuance or verification    → M4
  ACTIVE route status transition               → M4 only
  WalletConnect / Reown SDK integration        → Slice I (independent)
  USDC transfer execution                      → M6+ (ImplicitEx integration)
  1% fee collection                            → M6+ (fee execution milestone)
  Merchant checkout UX                         → later milestone
  Fee constitution enforcement                 → later milestone
  Multi-network routes (non-Polygon)           → future v0.2+
  Multiple simultaneous routes per IX ID       → future v0.2+
  Route delegation or sub-routing              → future
  Business entity verification                 → M5
  Holder profile management                   → M5
  BUSINESS_REGISTRATION verification claim    → future
  Re-enabling a DISABLED route                → future v0.2+ (create new route instead)
  Route recovery after REVOKED               → admin process; out of scope
  Fiat/card payment routes                   → not in roadmap
  Smart contract destination validation      → future v0.2+
  ZK proof of address ownership              → future; M4 uses ETH_SIGN_CHALLENGE
```

---

## Part 10: Acceptance Criteria for Future M3 Implementation

The M3 implementation is complete when all of the following are demonstrated
against the Firestore emulator (gate tests) and a live smoke (production gate):

```
1.  SET_PAYMENT_ROUTE — no prior route
      │
      ▼
    Account ACTIVE, IX ID ACTIVE, address valid, chain/asset correct
    Single Firestore transaction:
        payment_route_records/{id} created (status = PENDING_OWNERSHIP_PROOF,
            route_version = 1, status_version = 0)
        route_record_events record (CREATION, from_status = null)
        ix_ids/{ix_id}.pending_route_record_id = new record_id
        holder_operation_receipts/{operation_id} written
      │
      ▼
    201: route record, status = PENDING_OWNERSHIP_PROOF
    active_payment_route_claim_id remains null
    active_payment_route_address remains null
    GET /api/v0.1/identity/{ix_id}/route → payable: false

2.  GET /api/holder/v0.1/payment-route — returns pending route record

3.  Idempotent replay of SET_PAYMENT_ROUTE (same operation_id, same payload)
      │
      ▼
    Receipt found; exact full binding; account still ACTIVE
    Zero Firestore writes
    200: current authoritative route state

4.  SET_PAYMENT_ROUTE idempotency conflict (same operation_id, different address)
      │
      ▼
    422 IDEMPOTENCY_CONFLICT; zero writes

5.  Stale-revision rejection
      │
      ▼
    current route_version = 1; request sends expected_route_version = 0
    409 STALE_ROUTE_VERSION, current_route_version = 1; zero writes

6.  SET_PAYMENT_ROUTE replacement
      │
      ▼
    expected_route_version = 1; new address
    Single transaction:
        New record created (route_version = 2, PENDING_OWNERSHIP_PROOF)
        Old record transitioned to SUPERSEDED, status_version++
        route_record_events written for both
        pending_route_record_id updated to new record_id
        Receipt written
    201: new route record
    active_payment_route_claim_id still null

7.  DISABLE_PAYMENT_ROUTE
      │
      ▼
    Current route → DISABLED (terminal), status_version++
    pending_route_record_id cleared on ix_ids/{ix_id}
    route_record_events record written
    Receipt written
    200: disabled route record
    GET payment-route → payable: false

8.  DISABLE_PAYMENT_ROUTE — no current route
      │
      ▼
    409 NO_CURRENT_ROUTE; zero writes

9.  DISABLE_PAYMENT_ROUTE on already-terminal route
      │
      ▼
    422 ROUTE_ALREADY_TERMINAL; zero writes

10. Cross-account mutation denial
      │
      ▼
    Account B authenticates; IX ID belongs to Account A
    SET_PAYMENT_ROUTE → 403 NOT_FOUND_OR_NOT_AUTHORIZED
    Zero writes; external response identical to "not found"

11. SUSPENDED account read
      │
      ▼
    GET /api/holder/v0.1/payment-route → 200 (suspended accounts may read)

12. SUSPENDED account mutation
      │
      ▼
    SET_PAYMENT_ROUTE → 403; DISABLE_PAYMENT_ROUTE → 403

13. DISABLED/CLOSED account
      │
      ▼
    Any operation → 403

14. Invalid address formats
      │
      ▼
    Address without 0x prefix → 422 INVALID_ADDRESS
    Address too short → 422 INVALID_ADDRESS
    Zero address (0x000...000) → 422 INVALID_ADDRESS

15. Unsupported chain/asset
      │
      ▼
    chain = "ETHEREUM_MAINNET" → 422 UNSUPPORTED_CHAIN
    asset = "USDC.e" → 422 UNSUPPORTED_ASSET

16. Public route endpoint — no active route
      │
      ▼
    GET /api/v0.1/identity/{ix_id}/route → { payable: false }
    (pending or disabled route does not change this response)

17. Concurrent SET_PAYMENT_ROUTE — same IX ID, two sessions
      │
      ▼
    One wins (201); other receives 409 STALE_ROUTE_VERSION
    Exactly one current route record; zero partial state

18. TOCTOU: account suspended between pre-check and transaction commit
      │
      ▼
    Transaction re-reads account_state; SUSPENDED → abort → 403
    Zero writes

19. Denial produces zero Firestore writes
      │
      ▼
    All 401, 403, 409, 422 responses leave all Firestore collections unchanged

20. Audit trail reconstruction
      │
      ▼
    route_record_events alone reconstructs:
        who set the route (account_id), when, to which address,
        all version transitions in order
    No token or raw Firebase UID in any event record
    No raw address in Cloud Logging (address_hash only)

21. Firestore Security Rules — new subcollections
      │
      ▼
    Unauthenticated client: payment_route_records → read denied, write denied
    Firebase-authenticated client: same collections → read denied, write denied

22. Cache-Control on all holder route endpoints
      │
      ▼
    Cache-Control: no-store on GET /api/holder/v0.1/payment-route
    Cache-Control: no-store on POST /api/holder/v0.1/payment-route
    Cache-Control: no-store on POST /api/holder/v0.1/payment-route/disable

23. Public route endpoint cache policy
      │
      ▼
    Cache-Control: public, max-age=30, s-maxage=30
    on GET /api/v0.1/identity/{ix_id}/route
```

---

## Part 11: Migration and Compatibility

### 11.1 Existing accounts and IX IDs

M3 adds new fields and subcollections to existing data structures. No existing
documents are modified during M3 deployment.

- Existing `ix_ids/{ix_id}` documents gain new fields with null initial values
  (`pending_route_record_id = null`, `active_payment_route_address = null`).
  These fields may be absent from pre-M3 documents; the service must treat
  absent and null as equivalent (no payment route).

- `active_payment_route_claim_id` was already declared in the frozen schema.
  It has always been null in production. No migration needed.

- `holder_operation_receipts` gains two new operation_type enum values. Existing
  receipts are unaffected.

### 11.2 Holder Authority handler

The M3 implementation adds new route handlers to `ixid_holder_authority_handler.py`.
The existing CREATE_ACCOUNT, REGISTER_IX_ID, and GET workspace handlers are not
modified. The single `HolderAuthorityService` class (§5.2 of the M1 spec) is
extended with new methods for route operations; no alternative implementation
authority is created.

### 11.3 Projection service

The `ixid-projection` service gains a new route handler for
`GET /api/v0.1/identity/{ix_id}/route`. It reads only `ix_ids/{ix_id}` document
fields that already exist in its read path. No new Firestore queries on
subcollections. The projection SA (`ixid-projection-runtime`) has `datastore.viewer`
and may read `ix_ids/{ix_id}` but may not read `payment_route_records` subcollections.
The fail-closed contract is preserved: the projection only serves data from the
`active_payment_route_address` field, which is null until M4.

### 11.4 Account state at M3 entry

An account may enter M3 from any of:
- Clean M2 state: account ACTIVE, IX ID ACTIVE, no payment route
- Post-M3 state: if M3 has already deployed and the holder previously set a route

The M3 implementation must handle both cases. GET /api/holder/v0.1/payment-route
returns the current route record (or null) in both cases without error.

---

## Part 12: Dependency Chain

```
M1 — Holder Authority v0.1              CLOSED (d5841d1 impl, e880898 commit)
    Provides: account model, IX ID model, auth identity model, idempotency
    receipts, audit event collections, two-tier service architecture
         ↓
M2 — IX ID Registration / Onboarding v0.1   CLOSED contract; partially deployed
    Provides: email verification, onboarding UI, config-gated production
    frontend; M2 activation phases 3–5 parked on external dependencies
    Slice H (dark): wallet connection UI complete at 47e946e
         ↓
M3 — Payment Route Management v0.1      THIS DOCUMENT
    Provides: route declaration and read surface
    Requires: M1 account/auth model, M2 IX ID model
    Does NOT provide: ownership proof, payment capability
         ↓
M4 — Payment Route Ownership Verification
    Provides: wallet ownership proof (SIWE or equivalent)
    Promotes: PENDING_OWNERSHIP_PROOF → ACTIVE route
    Enables: active_payment_route_claim_id and active_payment_route_address set
    Requires: M3 route record exists in PENDING_OWNERSHIP_PROOF state
         ↓
M5 — Holder Profile Management         (parallel; does not block payment)
    Provides: display_name, bio, logo, business address
         ↓
Payment execution / 1% fee path
    M6 — ImplicitEx sender / USDC payment integration
    Reads: GET /api/v0.1/identity/{ix_id}/route → payable: true
    Executes: on-chain USDC transfer to active_payment_route_address
    Records: ix_transaction_refs evidence record
    Collects: 1% fee (fee execution milestone; separate from M6 route read)
```

The critical path to the revenue model is:

```
M3 (route declared) → M4 (route proven) → payment layer reads ACTIVE route
    → USDC transfer → fee collected
```

Slice I (WalletConnect SDK) can be pursued in parallel with M3/M4 without
blocking the critical path. It improves wallet reach (mobile) but does not
change the route management or ownership proof protocols.

---

## Falsification Attempts

### R-1: Set route for another IX ID

**Attack:** Authenticated Account B sends SET_PAYMENT_ROUTE to IX ID "alice",
which is owned by Account A.

**Model answer:** §8.3 — server resolves ix_id from account's `owned_ix_id`.
Request-body IX ID is not accepted for routing. Even if the request targets
"alice", the authority operates only on the authenticated account's owned IX ID.
If `owned_ix_id ≠ target`, response is 403 NOT_FOUND_OR_NOT_AUTHORIZED.

### R-2: Skip to ACTIVE without M4

**Attack:** Client sends `{ "status": "ACTIVE" }` in the SET_PAYMENT_ROUTE body.

**Model answer:** Route status is set entirely by the server. Request body fields
are validated; `status` is never a client-supplied parameter. The created record
always starts at PENDING_OWNERSHIP_PROOF. No code path in M3 transitions to ACTIVE.

### R-3: Activate a pending route by calling a holder endpoint with a forged token

**Attack:** Client forges a Firebase token with admin claim to bypass ownership check.

**Model answer:** Firebase tokens are verified server-side via the Firebase Admin SDK.
The `aud` claim is checked against `ixid-prod`. No custom claims are trusted for
route activation. ACTIVE status is set only by the M4 ceremony which has its own
server-side signature verification.

### R-4: Route payment to pending address via the projection

**Attack:** Caller queries `/api/v0.1/identity/{ix_id}/route` and gets the pending
address by reading raw subcollection data.

**Model answer:** The projection service does not read `payment_route_records`
subcollections. It reads only `active_payment_route_address` from `ix_ids/{ix_id}`.
Security Rules deny direct client reads on `payment_route_records`. The structural
separation ensures the projection has no path to a PENDING address.

### R-5: Concurrent replacement races to produce two active records

**Attack:** Two concurrent SET_PAYMENT_ROUTE requests both see `route_version = 1`
and both attempt to create `route_version = 2`.

**Model answer:** Both transactions contend on the prior route record's `status_version`
field inside the Firestore transaction. One wins; the other sees a version conflict,
aborts, and returns 409 STALE_ROUTE_VERSION. Exactly one new record is created.

### R-6: Re-use operation_id from a different IX ID

**Attack:** `operation_id = abc` was used for SET_PAYMENT_ROUTE on "alice".
Attacker replays the same `operation_id` for "bob".

**Model answer:** The `payload_fingerprint` includes `canonical_handle` in its
preimage. An `operation_id` from "alice" has a fingerprint over "alice"; using
it for "bob" produces a different fingerprint → 422 IDEMPOTENCY_CONFLICT.

---

*This specification is DRAFT. It is pending independent contract review,
sentinel POST-WORK verification, and explicit human commit authorization.
Implementation does not begin before this specification is committed as FROZEN.*

*v0.1 — 2026-08-24*
