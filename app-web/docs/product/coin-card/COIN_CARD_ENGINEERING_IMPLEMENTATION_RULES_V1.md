# Coin Card Engineering Implementation Rules — V1

**Status:** DRAFT 2026-07-21
**Type:** Engineering discipline document — not commercial, not legal
**Authority chain:**

```text
COIN_CARD_COMMERCIAL_SPEC_V1.md
    -> COIN_CARD_PURCHASE_PROVISIONING_ARCHITECTURE_V1.md
    -> this document
    -> implementation
```

---

## Purpose

This document defines the engineering rules that every Coin Card implementation must follow. These are not commercial promises or legal commitments. They are implementation discipline — constraints on *how* the system is built so that the commercial promises and invariants defined in the spec can be trusted.

A violation of a rule in this document is an implementation defect. If a rule cannot be followed for a legitimate reason, the rule must be discussed and revised before the exception is shipped, not after.

---

## Rule 1 — The Event Table is the law

No state transition may occur that is not listed in the Event Table (COIN_CARD_COMMERCIAL_SPEC_V1.md, § Event table).

If an engineer encounters a situation where a new transition seems necessary, the correct response is:

1. Stop.
2. Propose the new transition in the spec.
3. Verify the transition doesn't violate any invariant or failure guarantee.
4. Update the spec.
5. Then implement.

An undocumented transition in production is a spec violation. It must be treated as a bug, not a feature.

---

## Rule 2 — Every webhook handler is idempotent

Stripe may deliver the same webhook event more than once. Network failures, retries, and infrastructure restarts all produce duplicate deliveries.

Every webhook handler must:
- Verify the Stripe webhook signature before processing any payload.
- Extract the entity ID (PaymentIntent ID, charge ID, etc.) from the event.
- Check whether that event has already been processed for that entity ID.
- If already processed: return 200, take no action.
- If not yet processed: process and record.

A webhook handler that charges a customer twice, provisions two cards, or triggers two refunds because of a duplicate delivery is a critical defect.

---

## Rule 3 — Every external call carries a correlation ID

Every call to Stripe, every email dispatch, every registry write, and every reconciliation action must carry a correlation ID that can be used to trace the full lifecycle of an order in logs.

The order_id is the primary correlation key. All log lines, Stripe metadata, email headers, and database writes must include order_id where it exists. For pre-order operations (account creation, handle availability check), the session or request ID serves until an order_id exists.

Without correlation IDs, incident investigation requires guesswork across system boundaries. That cost is paid in production.

---

## Rule 4 — Every state transition is logged

Every time an order, registry record, or refund_request changes status, the transition must be written to a durable log with:

- `order_id` (or relevant entity ID)
- `event` — the event name from the Event Table
- `from_state`
- `to_state`
- `timestamp` (UTC)
- `triggered_by` — webhook event ID, reconciliation job run ID, or operator ID
- Any error details, if the transition was a failure path

The log is an audit trail, not debugging output. It must survive service restarts and be queryable by order_id. An order whose full history cannot be reconstructed from the log is an order that cannot be investigated.

---

## Rule 5 — Provisioning is keyed on order_id

The provisioning service must check for an existing ACTIVE registry record for the given order_id before writing anything.

If a record already exists:
- Return success.
- Do not overwrite.
- Do not write a second registry record.

This check must happen inside the provisioning transaction, not before it. A check-then-write with a gap between them is a race condition.

One order_id produces at most one Coin Card. If the system cannot enforce this at the database level, it must enforce it at the application level with a lock or a unique constraint on order_id in the registry_records table.

---

## Rule 6 — Retries use exponential backoff with jitter

Any operation that may fail transiently (Stripe API calls, manifest writes, email dispatch, registry writes) must be retried with exponential backoff.

Baseline rule:

```
attempt 1:  immediate
attempt 2:  wait 1s   + jitter
attempt 3:  wait 2s   + jitter
attempt 4:  wait 4s   + jitter
attempt 5:  wait 8s   + jitter
...
```

Jitter is a random component (±25% of the base delay) that prevents thundering-herd behavior when a shared dependency recovers from an outage.

Maximum retry counts are set per operation in `COIN_CARD_PURCHASE_PROVISIONING_ARCHITECTURE_V1.md`. After the maximum is exhausted, the operation must fail explicitly to a loggable error state — not silently.

---

## Rule 7 — Reconciliation passes are replay-safe

The reconciliation job may run on any schedule and may be triggered manually by an operator. It must be safe to run twice in rapid succession without producing incorrect state.

Replay safety requirements:
- Each reconciliation action must check current state before acting. A HELD handle whose heldUntil is in the future must not be released even if the reconciliation job has run before.
- A provisioning retry on an order that was already provisioned during a previous reconciliation run must detect the existing ACTIVE registry record and take no action.
- Reconciliation must log every action it takes, including no-ops (for debugging).

A reconciliation job that produces different outcomes when run twice against the same initial state is defective.

---

## Rule 8 — Immutable fields are enforced at the database level

Fields declared immutable in `COIN_CARD_COMMERCIAL_SPEC_V1.md` or `COIN_CARD_PURCHASE_PROVISIONING_ARCHITECTURE_V1.md` must not be updatable after they are set.

Enforcement options (in order of preference):
1. Database constraints (no UPDATE pathway in schema).
2. Application-layer guard that rejects writes to immutable fields after initial set.
3. Append-only record pattern where the current value is read from the most recent record.

Enforcing immutability only in application code without a database constraint is insufficient — database-level writes during incident recovery can bypass application guards.

**Fields that are immutable after PROVISIONED:**
`order_id`, `handle`, `card_id`, `wallet_address`, `manifest_hash`, `activated_at`, `amount_cents`, `currency`, `stripe_customer_id`, `paid_at`

**Fields that are immutable after REFUNDED:**
`refunded_at`, `held_until`

---

## Rule 9 — PROVISION_FAILED must alert

When an order transitions to `PROVISION_FAILED`, an alert must fire to an operator-monitored channel. This is not a metric to be reviewed in a dashboard — it requires active response.

The alert must include:
- `order_id`
- `handle`
- `account_id`
- Number of provisioning attempts made
- Last error encountered
- Timestamp

No alert means no recovery. A customer has paid and has no card. The ops silence interval for this alert is zero.

---

## Rule 10 — Tests must cover every invariant and every event table row

Every Commercial Invariant listed in `COIN_CARD_COMMERCIAL_SPEC_V1.md` must have at least one automated test that verifies the invariant holds.

Every row in the Event Table must have at least one automated test that verifies:
- The transition occurs when the event fires in the correct from-state.
- The transition does not occur when the same event fires in any other state.
- The transition is idempotent if the row is marked idempotent.

Tests that verify implementation behavior are necessary but not sufficient. Tests must also verify that the spec's behavioral contracts hold, not just that the code runs.

**Test naming convention:**
```
invariant_<number>_<short_description>
event_<event_name>_from_<from_state>_transitions_to_<to_state>
event_<event_name>_from_<wrong_state>_is_noop
event_<event_name>_is_idempotent  (for idempotent events)
```

---

## Rule 11 — No authority substitution

Each authority defined in the Authority Matrix must not substitute for another.

Specifically:
- Do not infer order state from Stripe events alone. Write order state explicitly.
- Do not infer card validity from the order record. Read the registry record.
- Do not infer payment status from the registry record. Query Stripe or the order record.
- Do not treat a successful API response from Stripe as proof that the order is COMPLETE. COMPLETE requires provisioning, not just payment.

A system that reads Stripe to determine whether a card is active, or reads the registry to determine whether payment occurred, has conflated its authorities. Conflated authorities produce split-brain states that are difficult to reconcile and dangerous to reason about under failure.

---

## Rule 12 — Stripe idempotency keys are mandatory on all write operations

Every Stripe API call that creates or modifies a resource (PaymentIntent creation, refund initiation) must include a Stripe idempotency key.

Idempotency key conventions:
- PaymentIntent creation: `order_<order_id>`
- Refund initiation: `refund_<refund_request_id>`

If a Stripe call fails and is retried with the same idempotency key, Stripe returns the same result as the first successful call. Without idempotency keys, a retry after a timeout can create a second charge or a second refund.

---

## Rule 13 — No silent failures

Every error must be logged. No catch block may swallow an error without logging it.

Categories:
- **Transient errors** (network timeout, Stripe rate limit): log + retry per Rule 6.
- **Permanent errors** (invalid handle, duplicate order): log + fail explicitly to the appropriate error state.
- **Unexpected errors** (unhandled exception, unknown state): log + alert; treat as PROVISION_FAILED if an order is in progress.

A failure that is not logged cannot be diagnosed. A failure that cannot be diagnosed cannot be recovered.

---

## Rule 14 — No state machine bypass

State transitions must go through the state machine layer. Direct database updates that change order.status, registry.card_status, or registry.handle_status without going through the state machine — even in migration scripts, admin tools, or one-off fixes — are not permitted without explicit operator approval and a log entry.

Manual operator overrides (e.g., `manual_re_provision`, `manual_refund_decision`) must be recorded in the event log with the operator's identity and the reason.

---

## Rule 15 — Every tool that can modify persistent state must fail closed on unverified environment

Any executable capable of writing to, deleting from, or modifying persistent data — including
Firestore, Cloud Storage, databases, file systems, Stripe, or any external API — must positively
verify that it is operating in an approved environment before it initializes any write-capable
service or performs any write operation.

If the environment cannot be proven safe, execution must terminate immediately with a clear error
message, before any connection to a write-capable service is established.

**Approved environment verification must check all of the following:**
- The active project or environment identifier is on an explicit allowlist (not a blacklist).
  Allowlists fail closed on anything not explicitly approved — including production, staging,
  unknown developer projects, and typos. Blacklists require ongoing maintenance and fail open
  on new projects.
- Required environment flags are present (e.g., emulator host variables).
- No production credential sources are active in the shell context.

**Applies to:**
- Spike and research scripts that seed or verify data
- Migration and backfill scripts
- Admin and operator tooling
- Reconciliation and repair jobs
- Registry publishing pipelines
- Refund and reversal processing
- Any CI/CD automation that writes to shared infrastructure

**Implementation pattern:**
```javascript
// Allowlist — fails closed on any project not explicitly approved.
const ALLOWED_ENVIRONMENTS = new Set(['demo-spike']); // extend when new safe environments are needed

function guardAgainstUnapprovedEnvironment() {
  const project = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || null;
  if (project && !ALLOWED_ENVIRONMENTS.has(project)) {
    console.error('SAFETY GUARD: refusing to run — environment not in approved allowlist.');
    console.error(`  Detected: ${project}`);
    console.error(`  Allowed: ${[...ALLOWED_ENVIRONMENTS].join(', ')}`);
    process.exit(1);
  }
  if (!process.env.REQUIRED_EMULATOR_HOST) { // replace with actual guard
    console.error('SAFETY GUARD: required emulator flag not set.');
    process.exit(1);
  }
}

guardAgainstUnapprovedEnvironment(); // must be called before initializeApp()
```

This guard must execute **before** any service initialization call (`initializeApp`,
`Firestore()`, database connection, Stripe client construction). A guard that runs
after service initialization has already established the connection it was meant to prevent.

*This rule applies beyond Coin Card. It applies to all ImplicitEx tooling that can modify
persistent state, regardless of the product surface or the service being written to.*

---

## Relationship to Other Documents

| Document | Relationship |
|---|---|
| COIN_CARD_COMMERCIAL_SPEC_V1.md | Governs. If this document conflicts with the spec, the spec wins. |
| COIN_CARD_PURCHASE_PROVISIONING_ARCHITECTURE_V1.md | Sibling. Architecture defines what the system does; these rules define how it is built. |
| Implementation (code) | Child. Implementation must satisfy these rules. Code that violates a rule is defective. |
| Tests | Verify implementation. Tests that pass while implementation violates a rule are insufficient tests. |

---

*This document derives from COIN_CARD_COMMERCIAL_SPEC_V1.md. Rules here must not conflict with commercial invariants or failure guarantees defined in that document. If a rule cannot be satisfied without violating a commercial invariant, the invariant governs.*
