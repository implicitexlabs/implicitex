# IX ID Firestore Schema
## v0.1 — August 17, 2026

This document is the storage-layer enforcement of `ixid-identity-trust-architecture-v0.1.md`. Where the architecture describes invariants in prose, this document makes them structural. The two documents must remain consistent; a change to one requires a reviewed change to the other.

**Governing principle:** What may be created, what may be mutated, who may mutate it, which transitions are legal, and what append-only evidence must accompany every mutation.

---

## Collection Map

```
ix_ids/{ix_id}/
    [account document]
    verification_claims/{claim_id}/
        [claim document]
        events/{event_id}/              ← append-only transition log
    wallet_binding_events/{event_id}/   ← append-only; one per wallet bind
    domain_challenges/{challenge_id}/   ← lifecycle-mutable; PENDING→CONSUMED; see §4b
    domain_verification_records/{record_id}/ ← append-only; evidence for DOMAIN claims; see §4c
    domain_recheck_events/{event_id}/   ← observation log; one per recheck run; see §4d
    identity_mutations/{event_id}/      ← append-only; one per profile change
    security_events/{event_id}/         ← append-only; auth and security telemetry
    ix_transaction_refs/{ref_id}/       ← append-only; one per IX payment interaction
    review_cases/{case_id}/             ← case-mutable; see §7
    preservation_holds/{hold_id}/       ← hold-mutable; see §8
```

All subcollections are append-only unless explicitly stated otherwise. No document in an append-only subcollection may be updated or deleted by any process, including administrative tooling.

---

## §1 — `ix_ids/{ix_id}`

The account document. `ix_id` is the handle (e.g., `mariastacos`); the full subdomain is derived.

### 1.1 Fields

**Immutable after creation**

| Field | Type | Notes |
|---|---|---|
| `ix_id` | string | Handle; 3–30 chars; matches handle policy |
| `created_at` | timestamp | Account registration timestamp |
| `registration_ip_event_ref` | string | Pointer to security_events record for registration IP |

**Account-mutable** (by authenticated account controller, through defined operations)

| Field | Type | Notes |
|---|---|---|
| `display_name` | string | Business or personal name supplied by controller |
| `bio` | string | Controller-supplied description |
| `website_url` | string | Controller-supplied; not IX-verified unless DOMAIN claim exists |
| `logo_storage_ref` | string | Storage path for current logo |
| `banner_storage_ref` | string | Storage path for current banner |
| `contact_email` | string | Controller-supplied contact |
| `contact_phone` | string | Controller-supplied contact |
| `business_address` | map | Controller-supplied; not IX-verified unless BUSINESS_IDENTITY claim exists |

Every write to an account-mutable field must produce a corresponding `identity_mutations` event before the write is committed. Transactions are required; partial writes are rejected.

**System-mutable** (by IX server processes only; never by client)

| Field | Type | Notes |
|---|---|---|
| `account_status` | enum | REGISTERED \| ACTIVE \| SUSPENDED \| CLOSED \| INVALID_ACTIVATION |
| `account_status_changed_at` | timestamp | Last status change |
| `active_payment_route_claim_id` | string | claim_id of current ACTIVE PAYMENT_ROUTE claim; null if none |
| `routing_suspended` | boolean | True if routing is suspended independent of account status |
| `routing_suspended_at` | timestamp | — |
| `routing_suspension_reason` | string | Reason code |

### 1.2 Who May Write

| Field category | Allowed writers |
|---|---|
| Immutable fields | IX server at account creation only |
| Account-mutable fields | Authenticated account controller via IX API (server validates, not direct Firestore) |
| System-mutable fields | IX server (Cloud Functions / Admin SDK) only |

Client SDKs must not have write access to `ix_ids` documents directly. All writes flow through IX API endpoints that enforce field-level rules and produce required event records.

### 1.3 Legal Account Status Transitions

```
REGISTERED → ACTIVE               on first PAYMENT_ROUTE claim becoming ACTIVE
REGISTERED → SUSPENDED            on security determination
ACTIVE     → SUSPENDED            on credible impersonation report or security determination
ACTIVE     → CLOSED               on controller request
SUSPENDED  → ACTIVE               on investigation resolution: cleared
SUSPENDED  → INVALID_ACTIVATION   on investigation resolution: impersonation confirmed
SUSPENDED  → CLOSED               on controller request post-clearance
CLOSED     → [no transitions]
INVALID_ACTIVATION → [no transitions]
```

Every transition must write a `security_events` record before committing the status change.

---

## §2 — `ix_ids/{ix_id}/verification_claims/{claim_id}`

### 2.1 Immutable Fields (set at creation; never updated)

| Field | Type |
|---|---|
| `claim_id` | string |
| `claim_type` | enum: PAYMENT_ROUTE \| DOMAIN \| BUSINESS_IDENTITY |
| `subject` | string (wallet address, domain, or org name) |
| `evidence_type` | enum: ETH_SIGN_CHALLENGE \| MICRO_TRANSFER \| DNS_TXT \| WELL_KNOWN_FILE \| DOMAIN_EMAIL \| BUSINESS_REGISTRATION \| MANUAL_REVIEW |
| `evidence_ref` | string (pointer to wallet_binding_events or external evidence record) |
| `verified_at` | timestamp (ceremony that created this claim) |
| `expires_at` | timestamp or null |
| `verification_policy_version` | string (e.g. `domain-v1`) |
| `assurance_level` | enum: LOW \| STANDARD \| HIGH |
| `verifier` | enum: IX_AUTOMATED \| IX_HUMAN \| IX_COUNSEL |
| `supersedes` | string (claim_id of prior claim replaced by this one) or null |
| `created_at` | timestamp |

Firestore security rules must deny any update to these fields after the document is created. Enforcement must not rely on application code.

### 2.2 Lifecycle-Mutable Fields (updated only through legal transitions)

| Field | Type | Notes |
|---|---|---|
| `status` | enum: ACTIVE \| EXPIRED \| REVOKED \| SUPERSEDED \| RECHECK_REQUIRED | — |
| `state_version` | integer | Starts at 0 on creation; incremented by exactly 1 on every transition |
| `last_rechecked_at` | timestamp | — |
| `recheck_required_at` | timestamp or null | — |
| `grace_expires_at` | timestamp or null | — |
| `expired_at` | timestamp or null | — |
| `superseded_by` | string (claim_id) or null | — |
| `revocation_reason` | string or null | — |

`state_version` is the authoritative ordering mechanism for claim transitions. `occurred_at` timestamps are useful evidence but are not used as the ordering source of truth — clock skew and retry timing can make timestamps unreliable for this purpose.

Every Firestore transaction that updates `status` must also increment `state_version` by exactly 1 and require that the current `state_version` matches the `from_version` in the transition event. If the claim was modified by a concurrent transaction, `state_version` will have changed and the transaction fails, forcing re-evaluation from the new state.

### 2.3 Legal Claim Status Transitions

| From | To | Trigger | Required accompanying event |
|---|---|---|---|
| `ACTIVE` | `RECHECK_REQUIRED` | Confirmed negative (§4.3 of arch spec) | `verification_claim_events` record |
| `ACTIVE` | `EXPIRED` | `expires_at` reached | `verification_claim_events` record |
| `ACTIVE` | `SUPERSEDED` | Renewal creates replacement claim | `verification_claim_events` record |
| `ACTIVE` | `REVOKED` | IX determination of fraud | `verification_claim_events` record + `security_events` record |
| `RECHECK_REQUIRED` | `ACTIVE` | Artifact restored before `grace_expires_at` | `verification_claim_events` record |
| `RECHECK_REQUIRED` | `EXPIRED` | `grace_expires_at` reached | `verification_claim_events` record |
| `RECHECK_REQUIRED` | `SUPERSEDED` | Renewal during grace period creates replacement claim | `verification_claim_events` record |
| `EXPIRED` | `ACTIVE` | Fresh renewal ceremony | Creates new claim; this record → SUPERSEDED |
| `SUPERSEDED` | [none] | Terminal | — |
| `REVOKED` | [none] | Terminal | — |

Every transition must be written as a Firestore transaction: the `verification_claim_events` record and the claim document update are committed atomically. A transition without a corresponding event is a protocol violation.

### 2.4 Who May Write

| Operation | Allowed writers |
|---|---|
| Create claim | IX server only |
| Update lifecycle-mutable fields | IX server only, within legal transitions |
| Update immutable fields | Nobody; blocked by security rules |
| Delete claim | Nobody |

---

## §3 — `ix_ids/{ix_id}/verification_claims/{claim_id}/events/{event_id}`

Append-only transition log for a single claim. Every status transition produces one event here.

### 3.1 Fields (all immutable; append-only collection)

| Field | Type |
|---|---|
| `event_id` | string |
| `claim_id` | string |
| `transition_operation_id` | string (used as document ID; see §3.2) |
| `from_status` | enum |
| `to_status` | enum |
| `from_version` | integer (claim.state_version before transition) |
| `to_version` | integer (must equal from_version + 1) |
| `occurred_at` | timestamp |
| `reason_code` | string |
| `triggered_by` | enum: IX_RECHECK \| IX_SCHEDULED \| IX_INCIDENT \| IX_RENEWAL \| IX_ADMIN \| IX_CONTROLLER_REQUEST |
| `operator_uid` | string or null (if IX_ADMIN or IX_INCIDENT) |
| `policy_version` | string (policy under which this transition was evaluated) |

No document in this collection may be updated or deleted.

### 3.2 Transition Operation ID — Idempotency Protocol

Cloud Functions and Firestore transactions may retry on transient failure. Without an idempotency key, a single logical transition (e.g., confirmed domain artifact missing → `RECHECK_REQUIRED`) could produce duplicate event records that appear as independent security events to an investigator.

`transition_operation_id` is used as the Firestore **document ID** for the event record. The Transition Service follows this read-first protocol inside the transaction:

```
receive transition_operation_id
        ↓
read events/{transition_operation_id}
        ↓
IF EVENT EXISTS:
    verify event.claim_id        == this operation's claim_id
    verify event.from_status     == this operation's expected from_status
    verify event.to_status       == this operation's intended to_status
    verify event.from_version    == this operation's expected from_version
    return IDEMPOTENT_SUCCESS (operation previously committed)
        ↓
ELSE:
    read current claim
    validate transition is legal from current state
    create event document
    update claim (status + state_version)
    commit atomically
```

"Fails silently" is explicitly rejected. A retry must recognize prior success and return `IDEMPOTENT_SUCCESS` — not depend on a failed document create being treated as a no-op. If a transition committed but the function died before returning, the retry reads the existing event, confirms it describes the same logical operation, and returns success without re-executing.

**Canonical inputs for `transition_operation_id`:**

The ID must be derived from inputs that are stable across retries and that uniquely identify the logical operation — not merely the desired outcome. Minimum required inputs:

```
claim_id            // which claim is transitioning
from_status         // expected source state
from_version        // expected source version (see §2.2)
to_status           // intended destination state
trigger_type        // IX_RECHECK | IX_SCHEDULED | IX_ADMIN | ...
trigger_ref_id      // stable ID for the triggering event:
                    //   scheduler: run/job ID issued once per invocation
                    //   manual/admin: command/request ID created before first attempt
                    //   incident: review case ID
```

Two genuinely separate attempts to make the same transition (e.g., two different recheck runs that both observe an artifact missing) must produce different `trigger_ref_id` values and therefore different operation IDs. They will not accidentally collapse into one logical event.

---

## §4 — `ix_ids/{ix_id}/wallet_binding_events/{event_id}`

Append-only. One document per wallet binding ceremony. This is the primary evidence record for `PAYMENT_ROUTE` claims.

### 4.1 Fields

| Field | Type |
|---|---|
| `event_id` | string |
| `ix_id` | string |
| `account_uid` | string |
| `wallet_address` | string |
| `network` | string (e.g. `polygon`) |
| `challenge_nonce` | string |
| `challenge_issued_at` | timestamp |
| `challenge_expires_at` | timestamp |
| `signature` | string |
| `signature_verified` | boolean |
| `binding_committed_at` | timestamp |
| `prior_wallet_address` | string or null |
| `prior_claim_id` | string or null |
| `method` | enum: ETH_SIGN_CHALLENGE \| MICRO_TRANSFER |
| `security_event_id` | string (pointer to security_events record for this binding) |

No document in this collection may be updated or deleted.

---

## §4b — `ix_ids/{ix_id}/domain_challenges/{challenge_id}`

Lifecycle-mutable. One document per issued DNS TXT challenge. Created PENDING; updated exactly once to CONSUMED when the challenge is satisfied. Never deleted.

### 4b.1 Fields

| Field | Type |
|---|---|
| `challenge_id` | string (UUID) |
| `ix_id` | string |
| `domain` | string |
| `account_uid` | string |
| `challenge_token` | string (256-bit URL-safe base64) |
| `txt_record_value` | string (full DNS TXT value: `ixid-verify={token}`) |
| `issued_at` | timestamp |
| `expires_at` | timestamp (`issued_at` + 48h) |
| `status` | enum: PENDING \| CONSUMED \| EXPIRED |
| `consumed_at` | timestamp or null |
| `verification_record_id` | string or null (set when consumed; points to `domain_verification_records` doc) |

A challenge transitions PENDING → CONSUMED atomically with the creation of the corresponding `domain_verification_record`. The challenge token is consumed exactly once; `verify_domain()` rejects any challenge not in PENDING status. Expiry is enforced by wall-clock check at verification time; the status field may lag until a background cleanup pass sets it to EXPIRED.

### 4b.2 Who May Write

| Operation | Allowed writers |
|---|---|
| Create (PENDING) | IX server at challenge issuance |
| Update to CONSUMED | IX server in same transaction as evidence record creation |
| Delete | Nobody |

---

## §4c — `ix_ids/{ix_id}/domain_verification_records/{record_id}`

Append-only. One document per completed DNS TXT verification ceremony. Written atomically with the CONSUMED update to `domain_challenges`. The `evidence_ref` field on the DOMAIN `verification_claim` document points to this record.

### 4c.1 Fields

| Field | Type |
|---|---|
| `record_id` | string (deterministic: `dvr_{challenge_id}`) |
| `ix_id` | string |
| `domain` | string |
| `challenge_id` | string |
| `challenge_token` | string (the token confirmed present in DNS TXT) |
| `verification_policy_version` | string (`domain-v1`) |
| `verified_at` | timestamp |
| `claim_expires_at` | timestamp (`verified_at` + 12 calendar months, domain-v1) |
| `resolver_type` | string (class name of resolver used) |
| `txt_records_observed` | array of strings (all TXT records returned) |
| `matching_txt_record` | string (the specific TXT value that matched) |
| `observation_completed_at` | timestamp |

The `challenge_token` field enables the recheck worker to retrieve the original token from this record via the claim's `evidence_ref`, without storing the token on the claim document itself.

No document in this collection may be updated or deleted.

---

## §4d — `ix_ids/{ix_id}/domain_recheck_events/{event_id}`

Append-only observation log for domain recheck operations. One document per recheck run. Written by the Domain Verification Service recheck worker; never by client code.

`event_id` is `{claim_id}_{run_id}`. The recheck worker follows a **create-only idempotency protocol**: before performing any DNS observation, it reads the event document at this ID. If the document already exists, `_replay_recheck_event()` is called on the stored document — it returns the stored outcome and, if the transition had not yet committed, re-runs `execute_transition()` to complete it. If no prior document exists, the worker proceeds normally. At write time, `recheck_ref.create()` is used; on `AlreadyExists` (concurrent worker committed first), the caller reads and replays the stored document. A retry is safe and forensically clean — the original evidence is never overwritten.

**DNS error semantics:** `primary_result` and `secondary_result` are three-valued: PRESENT | ABSENT | ERROR. ERROR means the DNS resolution itself failed (timeout, SERVFAIL, network unreachable). ERROR observations are recorded as operational telemetry but do not participate in the confirmed-negative chain. Only ABSENT (successful resolution, token not found) advances toward `RECHECK_REQUIRED`. Two DNS timeouts an hour apart are not two observations of artifact absence.

**Evidence-before-transition invariant:** For any outcome that triggers a claim lifecycle transition (CONFIRMED_NEGATIVE, RESTORED, GRACE_EXPIRED), the recheck evidence event MUST be successfully created before `execute_transition()` is called. The event MUST contain sufficient immutable reconstruction fields (`transition_from_status`, `transition_from_version`, `transition_to_status`, `transition_trigger_type`, `transition_trigger_ref_id`, `transition_reason_code`, and all relevant lifecycle timestamps) to reproduce the exact `TransitionRequest`. If the process crashes between `create()` and `execute_transition()`, the next call with the same `run_id` detects the stored event, reconstructs the `TransitionRequest` from the stored fields, and completes the transition. Replay MUST use the stored reconstruction params; it MUST NOT derive a new transition from current claim state.

**Scheduler `run_id` stability requirement:** Crash recovery depends on the retry presenting the same `run_id` as the crashed invocation. A scheduler occurrence ID must be stable across retries of the same occurrence. A new scheduled occurrence gets a new `run_id`. If redelivery fails, a repair sweep for events with `transition_triggered != null` and no corresponding committed Transition Service operation will detect and complete stranded transitions.

### 4d.1 Fields

**Observation fields**

| Field | Type |
|---|---|
| `event_id` | string |
| `claim_id` | string |
| `ix_id` | string |
| `domain` | string |
| `run_id` | string (stable across retries of the same scheduler occurrence; new occurrence = new run_id) |
| `checked_at` | timestamp |
| `primary_resolver` | string |
| `primary_txt_records_observed` | array of strings |
| `primary_result` | enum: PRESENT \| ABSENT \| ERROR (three-valued; see DNS error semantics above) |
| `primary_error_code` | string or null (e.g. `TIMEOUT`, `SERVFAIL`; set when primary_result == ERROR) |
| `secondary_resolver` | string or null (set when second observation performed) |
| `secondary_txt_records_observed` | array or null |
| `secondary_result` | enum or null (PRESENT \| ABSENT \| ERROR) |
| `secondary_error_code` | string or null |
| `prior_absence_event_id` | string or null (set when confirmed-negative path used) |
| `outcome` | enum: PRESENT \| RESTORED \| TRANSIENT_FAILURE \| CONFIRMED_NEGATIVE \| GRACE_ONGOING \| GRACE_EXPIRED \| DNS_ERROR |
| `grace_expires_at` | timestamp or null (set for GRACE_ONGOING outcomes) |

**Transition reconstruction fields** (set before `create()` for transition-triggering outcomes; null for non-transition outcomes)

| Field | Type | Notes |
|---|---|---|
| `transition_triggered` | string or null | Human-readable label, e.g. `ACTIVE_TO_RECHECK_REQUIRED` |
| `transition_operation_id` | string or null | Deterministic ID from `build_operation_id()`; computed before `create()` |
| `transition_from_status` | string or null | `ClaimStatus` value at time of observation |
| `transition_from_version` | integer or null | `state_version` of claim read before DNS observation |
| `transition_to_status` | string or null | Target `ClaimStatus` |
| `transition_trigger_type` | string or null | `TriggerType` value (e.g. `IX_RECHECK`, `IX_SCHEDULED`) |
| `transition_trigger_ref_id` | string or null | Equals `run_id`; stable across retries |
| `transition_reason_code` | string or null | e.g. `DOMAIN_CONFIRMED_NEGATIVE`, `DOMAIN_ARTIFACT_RESTORED`, `DOMAIN_GRACE_PERIOD_EXPIRED` |
| `transition_recheck_required_at` | timestamp or null | Set for CONFIRMED_NEGATIVE path |
| `transition_grace_expires_at` | timestamp or null | Set for CONFIRMED_NEGATIVE path |
| `transition_expired_at` | timestamp or null | Set for GRACE_EXPIRED path |
| `transition_last_rechecked_at` | timestamp or null | Set for CONFIRMED_NEGATIVE and RESTORED paths |

---

## §5 — `ix_ids/{ix_id}/identity_mutations/{event_id}`

Append-only. One document per material profile change. Produced in the same transaction as the account-mutable field update.

### 5.1 Fields

| Field | Type |
|---|---|
| `event_id` | string |
| `ix_id` | string |
| `mutation_type` | enum: DISPLAY_NAME \| BIO \| WEBSITE_URL \| LOGO \| BANNER \| CONTACT_EMAIL \| CONTACT_PHONE \| BUSINESS_ADDRESS |
| `prior_value_ref` | string or null (pointer to prior value snapshot if needed for reconstruction) |
| `new_value_hash` | string (SHA-256 of new value, for integrity) |
| `mutated_at` | timestamp |
| `session_event_id` | string (pointer to auth security_events record for session that made the change) |

Storing value hashes rather than values keeps this collection lean while preserving forensic integrity. Full value history, if needed, is reconstructed from the account document's current value plus the chain of mutations.

---

## §6 — `ix_ids/{ix_id}/ix_transaction_refs/{ref_id}`

Append-only. One document per IX-facilitated payment interaction. This is the meaning layer connecting IX identity to on-chain evidence.

### 6.1 Fields

| Field | Type |
|---|---|
| `ref_id` | string |
| `ix_id` | string |
| `amount_usdc` | string (decimal string; not float) |
| `polygon_tx_hash` | string |
| `sender_address` | string |
| `recipient_address` | string (the verified wallet address at time of transaction) |
| `payment_route_claim_id` | string (the PAYMENT_ROUTE claim active at time of transaction) |
| `initiated_at` | timestamp |
| `confirmed_at` | timestamp or null |
| `block_number` | number or null |
| `overlay_host` | string or null (the domain embedding the IX overlay, if applicable) |
| `order_ref` | string or null (merchant-supplied reference) |
| `memo` | string or null (payer-supplied) |

`recipient_address` and `payment_route_claim_id` are recorded at transaction time. If the IX ID later changes its wallet, the historical transaction record reflects the address that was active when the payment occurred.

No document in this collection may be updated or deleted.

---

## §7 — `ix_ids/{ix_id}/review_cases/{case_id}`

Case-mutable. Review cases have a lifecycle and may be updated through defined transitions.

### 7.1 Fields

| Field | Type |
|---|---|
| `case_id` | string |
| `ix_id` | string |
| `reason` | enum: NEW_ACTIVATION_RISK \| IMPERSONATION_REPORT \| PROFILE_ANOMALY \| DOMAIN_CONFLICT \| INTERNAL_ESCALATION |
| `entered_review_at` | timestamp |
| `initial_decision_due_at` | timestamp |
| `escalated_at` | timestamp or null |
| `escalation_due_at` | timestamp or null |
| `resolved_at` | timestamp or null |
| `resolution` | enum or null: CLEARED \| SUSPENDED \| INVALID_ACTIVATION \| CLOSED |
| `resolved_by` | string or null |
| `reporter_contact` | string or null |
| `reporter_evidence_refs` | array of strings |
| `status` | enum: OPEN \| ESCALATED \| RESOLVED |

### 7.2 Legal Case Transitions

```
OPEN → ESCALATED    when initial_decision_due_at passes without resolution
OPEN → RESOLVED     on decision within initial window
ESCALATED → RESOLVED on decision within escalation window
```

No case auto-resolves. Passing a deadline transitions to ESCALATED and triggers an operational alert; it does not produce a resolution.

---

## §8 — `ix_ids/{ix_id}/preservation_holds/{hold_id}`

### 8.1 Fields

| Field | Type |
|---|---|
| `hold_id` | string |
| `ix_id` | string |
| `reason` | enum: LAW_ENFORCEMENT_REQUEST \| FRAUD_COMPLAINT \| INTERNAL_SECURITY |
| `requested_by` | string |
| `hold_placed_at` | timestamp |
| `hold_expires_at` | timestamp or null (null = indefinite until explicitly lifted) |
| `lifted_at` | timestamp or null |
| `lifted_by` | string or null |
| `legal_reference` | string or null |

While a preservation hold is active, no retention-based archival or deletion process may act on any subcollection document associated with the account.

---

## §9 — `ix_ids/{ix_id}/security_events/{event_id}`

Append-only. Authentication events, security-relevant IP events, and administrative actions (status changes, suspension, etc.) that are worth preserving for forensic purposes.

### 9.1 Fields

| Field | Type |
|---|---|
| `event_id` | string |
| `ix_id` | string |
| `event_type` | enum: AUTH_SUCCESS \| AUTH_FAILURE \| ACCOUNT_STATUS_CHANGE \| ROUTING_SUSPENDED \| ROUTING_RESTORED \| WALLET_BIND \| ADMIN_ACTION |
| `occurred_at` | timestamp |
| `ip_address` | string or null (retention subject to counsel guidance; see arch spec §8.2) |
| `user_agent_hash` | string or null (hashed; not raw UA string) |
| `actor` | enum: CONTROLLER \| IX_SERVER \| IX_ADMIN \| IX_AUTOMATED |
| `actor_uid` | string or null |
| `detail` | map or null (event-type-specific additional fields) |

Retention schedule for `ip_address` and `user_agent_hash` fields: **TBD with counsel before production.** These fields are included in the schema to ensure IP telemetry is structured and queryable if retained; retention duration is a separate policy question.

---

## §10 — Enforcement Boundaries

IX ID's storage enforcement operates across three distinct boundaries. **Firestore Security Rules alone are not sufficient** — Firebase server client libraries bypass Security Rules and authenticate through IAM instead. The enforcement model accounts for all three layers.

### Boundary 1 — Untrusted Client (Firestore Security Rules)

Security Rules govern any request arriving via client SDKs (browser, mobile). For IX ID identity infrastructure, clients have **no direct write authority** to sensitive collections. The rule is blanket denial, not field-level filtering:

```
match /ix_ids/{ix_id}/{document=**} {
  allow write: if false; // all writes via IX backend only
}
```

For any client-authorized reads, Security Rules enforce access control. Firestore's `getAfter()` can validate that related documents are written together in the same transaction before commit — but for IX ID, client-side write paths to sensitive subcollections should not exist at all.

**Protected by Security Rules:**
- All `ix_ids` documents and subcollections: write = denied to all clients

### Boundary 2 — Trusted Service (IX Transition Service)

Server client libraries (Admin SDK / service account) bypass Security Rules and authenticate via IAM. The IX Transition Service is the single authoritative implementation of all claim lifecycle transitions. No other backend endpoint may contain its own version of these rules.

**Every transition must follow this sequence:**

```
generate / receive transition_operation_id
        ↓
[transaction begins]
read events/{transition_operation_id}
IF EXISTS: verify fields match this operation → return IDEMPOTENT_SUCCESS
        ↓
read current claim
verify claim.state_version == expected from_version
verify transition is legal from claim.status
verify immutable fields will not be modified
        ↓
construct event:
    from_status    = claim.status
    from_version   = claim.state_version
    to_status      = intended destination
    to_version     = claim.state_version + 1
        ↓
write event document (ID = transition_operation_id)
update claim: status = to_status, state_version = to_version
[transaction commits atomically]
```

If a concurrent transaction has already modified `claim.state_version`, Firestore detects the conflict and retries. The retry reads the new state and either re-evaluates the transition from the updated claim or recognizes the operation already committed via the `transition_operation_id` check.

If the transaction fails, the entire operation is retried with the same `transition_operation_id`. The idempotency key ensures retry does not produce duplicate events.

The IX Transition Service must enforce:

- **Immutable field guard:** reject any operation that would alter an immutable claim field
- **Legal transition guard:** reject transitions not in the defined state machine (§2.3)
- **Atomic write requirement:** claim mutation and event creation in a single transaction; no partial writes
- **Append-only enforcement:** no update or delete operations on append-only collections

These are service-layer invariants, not Firestore rule invariants, because the service operates through the Admin SDK. They must be implemented as explicit checks in the service code, covered by tests, and audited as part of any security review.

### Boundary 3 — Privileged Infrastructure (IAM + Operational Controls)

Because server libraries bypass Firestore Rules, IAM service-account control is part of the IX ID security architecture, not merely deployment configuration.

```
Internet / user
       ↓
Authentication (IX auth layer)
       ↓
IX authorization and policy checks
       ↓
IX Transition Service (single authority for claim transitions)
       ↓
Firestore transaction
       ↓
IAM / service identity (Admin SDK credentials)
       ↓
Firestore
```

**IAM requirements:**
- The IX Transition Service runs under a dedicated service account with the minimum required Firestore permissions
- Administrative tooling (incident response, preservation hold placement) runs under a separate service account with logged access
- No service account has both transition authority and administrative override authority
- Service account keys are not committed to version control; secrets managed via Secret Manager or equivalent

The combination of Boundary 1 (client writes blocked by Security Rules) + Boundary 2 (server writes validated by Transition Service) + Boundary 3 (Admin SDK access controlled by IAM) is what makes the storage enforcement complete.

**10.A Preservation Hold Enforcement**
Before any retention process deletes or archives a document, it must query `preservation_holds` for an active hold on the account. This check is a service-layer responsibility. An active hold blocks all archival operations on associated documents regardless of their individual retention schedules.

---

## §11 — Evidence Reconstruction and Verification Tests

**Firestore is not the evidence. Firestore is where IX stores the evidence.**

The evidentiary invariant is: IX can demonstrate what claim existed, what evidence supported it, which policy governed it, every state transition it underwent, who or what performed each transition, and its relationship to predecessor and successor claims. If IX someday migrates claim history to another persistence layer, the IX ID identity model does not change.

Given any IX ID, a complete evidence record can be reconstructed from subcollections alone, independent of the current account document state. This is an explicit design requirement enforced by two mandatory tests.

---

### Reconstruction paths

**Wallet binding history:** Read all `wallet_binding_events`, ordered by `binding_committed_at`.

**Profile history:** Read all `identity_mutations`, ordered by `mutated_at`.

**Verification claim history:** Read all `verification_claims/{claim_id}/events`. The document with `event_type = CLAIM_CREATED` (stored at `{claim_id}_CREATED`) contains every immutable field needed to reconstruct the full claim record without the materialized claim document. Subsequent transition events ordered by `to_version` establish the lifecycle history. The `supersedes` field on CLAIM_CREATED events links renewal chains across claim documents.

**Account status history:** Read all `security_events` with `event_type = ACCOUNT_STATUS_CHANGE`, ordered by `occurred_at`.

**Law enforcement evidence package:** All of the above, plus `ix_transaction_refs` ordered by `initiated_at`, plus `review_cases`, plus `preservation_holds`.

---

### Test 1 — Historical Reconstruction Test

**Question this test answers:** Did IX record the history?

```
1. Create a test IX ID
2. Execute a defined operation sequence:
     - wallet bind
     - domain verification
     - profile field change
     - wallet rebind (produces supersession chain)
     - simulated domain recheck failure (confirmed negative → RECHECK_REQUIRED)
     - artifact restoration (RECHECK_REQUIRED → ACTIVE)
     - domain renewal (fresh challenge → new claim, prior → SUPERSEDED)
3. Record expected history as a test fixture
4. Delete / zero-out the materialized account document and claim documents
   (subcollection documents remain)
5. Reconstruct full history from subcollections alone
6. Assert reconstructed history matches expected fixture:
     - correct number of wallet binding events in correct order
     - correct claim chain (supersedes / superseded_by linkage intact)
     - correct identity mutation events
     - correct account status events
```

If this test fails, the append-only subcollections are not being written correctly. The test is the enforcement mechanism for the write discipline.

---

### Test 2 — Transition Completeness Test

**Question this test answers:** Does the log match operational reality, and does operational reality match the log?

Read all lifecycle events for the claim, **ordered by `to_version` ascending** (not by `occurred_at`).

```python
events = sorted(claim_events, key=lambda e: e.to_version)

assert events[0].from_version == 0                        # chain starts at creation
assert events[0].from_status  == INITIAL_STATUS           # first transition from initial state

for i, event in enumerate(events):
    assert event.to_version == event.from_version + 1     # no version gaps or skips

for i in range(1, len(events)):
    assert events[i].from_version == events[i-1].to_version   # chain is continuous
    assert events[i].from_status  == events[i-1].to_status    # status continuity matches

operation_ids = [e.transition_operation_id for e in events]
assert len(operation_ids) == len(set(operation_ids))      # all operation IDs unique

last = events[-1]
assert last.to_version == claim.state_version             # event chain ends at current version
assert last.to_status  == claim.status                    # event chain ends at current status
```

**Divergence cases this test catches:**

| Failure | What it indicates |
|---|---|
| `from_version != 0` on first event | Chain does not start at creation — missing initial events |
| Gap in version sequence | A transition was applied to the claim without producing an event |
| Version continuity broken | Events were recorded out of order or a transition was skipped |
| Status continuity broken | A transition was recorded with the wrong `from_status` — staleness or race condition |
| Duplicate `transition_operation_id` | Idempotency failure; a retry produced a duplicate event |
| `last.to_version != claim.state_version` | The materialized claim is ahead of or behind the event log |
| `last.to_status != claim.status` | The event log and the materialized claim diverged |

These tests must be part of the IX ID integration test suite and must pass before any claim lifecycle code ships to production. If Test 2 fails, either the Transition Service wrote a claim update without its event (atomicity failure) or wrote an event without updating the claim (also atomicity failure) — both indicate the transaction was not correctly constructed.

---

*This schema implements the frozen architecture in `ixid-identity-trust-architecture-v0.1.md`. Schema changes that would require an architecture amendment must update both documents.*

*v0.1 — Antoine Dennison / ImplicitEx — 2026-08-17*
