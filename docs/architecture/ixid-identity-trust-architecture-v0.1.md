# IX ID Identity & Trust Architecture
## Specification v0.1 — FROZEN August 17, 2026

---

## Preamble

**IX ID is infrastructure. The URL is merely how humans reach it.**

`mariastacos.ixid.me` is not a webpage. It is a persistent payment identity with verifiable routing, controlled claims, immutable evidence, and a stable identifier that survives changes to the underlying transaction mechanism. The subdomain is how humans and systems address the identity; the identity itself is the durable object.

This specification defines what IX ID is allowed to claim, how those claims are established and expire, how accounts and claims transition between states, and what evidence is preserved regardless of claim status.

All implementation decisions — registration screeners, badges, overlay behavior, incident tooling, AI risk scoring — are derived from this document. This document does not derive from implementation decisions.

---

## Part 1: Architectural Invariants

The following are frozen. They may be amended only at a formal architecture milestone with documented rationale.

**I-1. Identity persists through wallet changes.**
A wallet address is the current routing target for an IX ID. It is not the identity. When an IX ID controller replaces their wallet, the identity continues under the same handle with a new routing target. The prior wallet binding becomes historical evidence, not the identity.

**I-2. Wallet control is not identity.**
Demonstrating cryptographic control of a wallet proves that the account controller can direct funds to that address. It does not prove who the controller is, what organization they represent, or that they have any right to represent an established business.

**I-3. Verification claims are discrete, typed assertions — not boolean fields.**
An IX ID does not have a single "verified" flag. It has zero or more verification claims, each with a specific type, subject, evidence record, assurance level, validity window, and status. UI badges are derived from active claims.

**I-4. Verification claims expire. Historical evidence does not.**
When a verification claim expires or is revoked, IX ID stops making the current assertion. It does not erase the historical fact that the claim was once established. The full verification history is permanent and append-only.

**I-5. Evidence is append-only.**
Wallet bindings, identity mutations, verification events, suspension actions, and complaint records are never overwritten. A wallet change creates a new binding event; a name change creates a new mutation event. Current state is computed from the event history, not stored as a mutable field to be clobbered.

**I-6. AI is a signal source, not a decision authority.**
Automated scoring, similarity detection, and behavioral analysis contribute evidence to a risk engine. Policy rules determine outcomes. An AI score does not suspend, ban, or clear an account. Only deterministic policy — and for cases that exceed policy thresholds, human review — makes binding decisions.

**I-7. Handle ownership does not confer the right to impersonate.**
Registering `walmart.ixid.me` does not authorize the account to represent Walmart, use Walmart's logo, or claim Walmart's address. The totality of the representation is evaluated, not just the handle. Handle ownership and identity claims are independent.

**I-8. IX ID is the identity layer. ImplicitEx is the transaction layer.**
IX ID answers: Who is the recipient claiming to be? What is the verified payment route? What has IX established? What changed, and when? What evidence exists?

ImplicitEx answers: How is value moved from sender to recipient?

These are related systems with different responsibilities. IX ID must be designed to survive changes to the transaction mechanism.

---

## Part 2: System Boundary

```
                         IX ID
                  Identity / Trust Layer
                          │
           ┌──────────────┼──────────────┐
           │              │              │
        Profile      Verification    Evidence
           │              │              │
           └──────────────┼──────────────┘
                          │
                    Payment Route
                          │
                          ▼
                     ImplicitEx
                  Transaction Layer
                          │
                          ▼
                   Wallet / Polygon
                          │
                          ▼
                         USDC
```

IX ID publishes a payment route derived from verified claims. ImplicitEx uses that route to execute transactions. The chain contains the authoritative transaction evidence. IX ID contains the meaning layer: the business context, identity claims, and evidence surrounding those transactions.

An IX transaction reference ties these three layers together:

```
IX ID record:       maria.ixid.me | Order #4817 | $47.82 | tx 0x7abc... | confirmed
Blockchain record:  0x7abc... → 0x91de... | 47.82 USDC | block 12345678 | timestamp
IX evidence:        wallet bound 2026-08-17 | domain verified 2026-08-17 | profile at time of tx
```

---

## Part 3: Verification Claim Schema

### 3.1 Immutable Facts vs. Lifecycle-Mutable Fields

A verification claim document has two distinct categories of fields. This distinction must be enforced by the storage layer and validation rules — it cannot rely on application discipline alone.

**Immutable after creation** — these fields establish the evidentiary facts of the verification ceremony. They must not change for any reason short of a formally documented administrative correction.

```
claim_id, claim_type, subject, evidence_type, evidence_ref,
verified_at, expires_at, verification_policy_version,
assurance_level, verifier, supersedes, created_at
```

**Lifecycle-mutable** — these fields track the claim's current operational state. They may change only through transitions defined in §4.6. Every transition must produce a corresponding append-only event in the `verification_claim_events` subcollection.

```
status, last_rechecked_at, recheck_required_at,
grace_expires_at, expired_at, superseded_by, revocation_reason
```

The governing invariant:

> **The facts establishing a verification claim are immutable. Lifecycle state may transition only through defined state-machine operations, and every transition is independently recorded in the append-only evidence log.**

This is stronger than claiming the entire claim document is immutable, because legitimate operational transitions — `ACTIVE → RECHECK_REQUIRED`, `ACTIVE → SUPERSEDED` — plainly need to be recorded on the live document. The constraint is that *evidentiary fields* cannot change, and that *every lifecycle field change* is accompanied by a separate event record. If the claim document were ever lost, the event log alone reconstructs the full history.

### 3.2 Claim Record

```
verification_claim {
  claim_id          string      // globally unique, immutable
  ix_id             string      // the ixid.me handle this claim belongs to
  account_uid       string      // internal account identifier
  claim_type        enum        // see 3.2
  subject           string      // what is being claimed about (wallet address, domain, org name)
  evidence_type     enum        // see 3.3
  evidence_ref      string      // pointer to the specific evidence record
  verified_at               timestamp   // timestamp of the verification ceremony that created THIS claim; immutable after creation
  expires_at                timestamp   // scheduled expiration for THIS claim; immutable after creation; null = no expiry defined
  supersedes                string      // claim_id of the prior claim this one replaced, if this claim was created by renewal
  last_rechecked_at         timestamp   // last opportunistic continuity recheck
  recheck_required_at       timestamp   // when confirmed-negative observation was first recorded
  grace_expires_at          timestamp   // recheck_required_at + grace period (only set when in grace)
  expired_at                timestamp   // when claim actually transitioned to EXPIRED
  verification_policy_version string    // e.g. "domain-v1"; governs grace period and recheck semantics
  assurance_level           enum        // LOW | STANDARD | HIGH
  verifier                  enum        // IX_AUTOMATED | IX_HUMAN | IX_COUNSEL
  status                    enum        // ACTIVE | EXPIRED | REVOKED | SUPERSEDED | RECHECK_REQUIRED
  superseded_by             string      // claim_id of replacement claim, if status = SUPERSEDED
  revocation_reason         string      // if status = REVOKED, brief reason code
  created_at                timestamp
}
```

### 3.2 Claim Types

| claim_type | Display label | What it asserts |
|---|---|---|
| `PAYMENT_ROUTE` | Payment Route Verified | IX ID controller demonstrated cryptographic control of this wallet |
| `DOMAIN` | Official Website Verified | IX ID controller demonstrated control of this internet domain |
| `BUSINESS_IDENTITY` | Business Identity Verified | IX has sufficient evidence to associate the controller with the represented organization |

`DOMAIN` and `BUSINESS_IDENTITY` are separate claims and must never be displayed as the same badge. Controlling `mariastacos.com` proves domain control, not legal business ownership.

### 3.3 Evidence Types

| evidence_type | Description |
|---|---|
| `ETH_SIGN_CHALLENGE` | Cryptographic wallet signature of IX-issued nonce (preferred) |
| `MICRO_TRANSFER` | Small on-chain transfer confirmed by controller (fallback only) |
| `DNS_TXT` | IX-issued challenge token found in DNS TXT record |
| `WELL_KNOWN_FILE` | IX-issued token found at `domain/.well-known/ixid` |
| `DOMAIN_EMAIL` | Email confirmation from address at the claimed domain |
| `BUSINESS_REGISTRATION` | Legal business registration document (human review required) |
| `MANUAL_REVIEW` | IX staff verification under documented procedure |

### 3.4 Assurance Levels

| Level | Meaning |
|---|---|
| `LOW` | Automated check only; suitable for basic routing |
| `STANDARD` | Automated check with cryptographic proof; suitable for verified display |
| `HIGH` | Human review or counsel-reviewed procedure; suitable for Business Identity claim |

---

## Part 4: Claim Lifecycle

### 4.1 Validity Windows

| claim_type | Normal validity | Renewal mechanism |
|---|---|---|
| `PAYMENT_ROUTE` | No expiry (active until replaced or account suspended) | Wallet change: new claim created, prior claim → SUPERSEDED |
| `DOMAIN` | 12 months from `verified_at` | Fresh-challenge ceremony; does not auto-extend |
| `BUSINESS_IDENTITY` | Defined per procedure at issuance; typically 24 months | Per procedure |

### 4.2 Recheck vs. Renewal — A Firm Distinction

These are different operations with different effects. They must never be conflated.

**Monthly opportunistic recheck** — continuity signal only.
IX checks whether the verification artifact (DNS TXT record or `.well-known/ixid` file) placed during original verification is still present. A successful recheck updates `last_rechecked_at`. It does **not** update `verified_at`, does **not** extend `expires_at`, and does **not** constitute renewal.

Rationale: if a recheck could renew the claim, an old public TXT token left in place after domain transfer would silently extend IX trust to a new domain owner — even though neither the original IX account holder nor the new domain owner participated in a new verification ceremony. A monthly recheck answers "is the old token still there?" not "does the current domain controller agree to be bound to this IX ID?"

**Annual renewal** — fresh proof ceremony, authenticated to the IX ID account.

```
Maria authenticates to IX ID
        ↓
IX issues fresh random challenge (new nonce, time-bounded)
        ↓
Maria publishes challenge response (TXT or .well-known)
        ↓
IX observes fresh challenge via independent resolution
        ↓
DOMAIN claim renewed: new verified_at, new expires_at
        ↓
Prior claim record → SUPERSEDED
```

The fresh challenge binds current domain control and current IX ID account authentication together in a single observable event. This is the only operation that extends `expires_at`.

### 4.3 Confirmed-Negative Semantics (DOMAIN recheck)

A single failed DNS lookup never starts the grace clock. DNS failures occur for transient reasons: resolver problems, DNSSEC issues, authoritative outages, deployment changes, `.well-known` path changes, CDN configuration.

A confirmed negative requires:

```
scheduled recheck
        ↓
artifact not observed
        ↓
retry via independent resolvers (minimum 2 independent paths)
        ↓
wait defined interval (minimum 1 hour), retry again
        ↓
artifact still not observed on all paths
        ↓
confirmed negative → RECHECK_REQUIRED
        ↓
14-day grace clock starts (grace_expires_at set)
```

A single-path, single-attempt failure must not transition the claim.

### 4.4 Two Distinct Expiry Clocks

**Clock A — Artifact disappears during the validity year:**

```
ACTIVE
    → confirmed artifact missing → RECHECK_REQUIRED (grace_expires_at set)
    → artifact restored within 14 days → ACTIVE (grace_expires_at cleared)
    → grace_expires_at reached without restoration → EXPIRED (expired_at set)
```

Payment routing continues during the 14-day grace period. The account is not suspended.

The **public badge presentation changes** at the `RECHECK_REQUIRED` transition, because IX has now confirmed that its verification artifact is no longer observable. Displaying an unchanged "Domain Verified" badge after a confirmed negative would manufacture certainty IX no longer has.

| Status | Public badge text | Subtext |
|---|---|---|
| `ACTIVE` | Domain Verified | — |
| `RECHECK_REQUIRED` | Domain Verification — Recheck Pending | Previously verified [date] |
| `EXPIRED` | Domain Verification Expired | — |

This reflects what IX actually knows at each state rather than presenting a constant trust signal through an event that has operational meaning. The account controller is not treated as fraudulent; they are given 14 days to restore the artifact. But a payer deserves to know IX's verification is under active recheck.

**Clock B — Scheduled annual expiration:**

```
expires_at reached
        ↓
EXPIRED (expired_at set)
```

`expires_at` is a hard boundary. There is no automatic grace extension when a scheduled expiration arrives. The claim expires; the badge is removed; `expired_at` is recorded. Renewal initiated immediately after expiration works; no penalties apply. But IX does not silently extend verified status past the expiration boundary.

Maria receives notification at 30, 14, and 7 days before `expires_at` to initiate renewal.

### 4.5 Policy Versioning

Grace period duration, recheck cadence, confirmed-negative retry logic, and notification schedule are governed by `verification_policy_version`, not hardcoded into the claim schema. The claim record stores the policy version under which it was created.

Initial policy: `domain-v1`

```
domain-v1 parameters {
  validity_months:           12
  recheck_cadence:           monthly
  confirmed_negative_paths:  2
  confirmed_negative_delay:  1 hour
  grace_period_days:         14
  renewal_notifications:     [30, 14, 7] days before expires_at
}
```

If operational experience warrants changing any of these values, a new policy version (`domain-v2`) is introduced. Existing claims retain their original `verification_policy_version` for historical accuracy. New claims use the current version.

This means: six months from now, if we determine the grace period should be 10 days, we change `domain-v2.grace_period_days = 10` rather than altering any existing claim record. Historical evidence accurately reflects what policy governed each claim.

### 4.6 Claim Transitions

```
[not present]
    → ACTIVE           on successful verification or renewal
    → RECHECK_REQUIRED on confirmed negative during validity window (grace clock starts)
    → EXPIRED          on grace_expires_at reached (artifact still absent)
    → EXPIRED          on expires_at reached without renewal
    → REVOKED          on IX determination: claim was fraudulent or improperly obtained
    → SUPERSEDED       on successful renewal (new claim created; prior claim → SUPERSEDED)
    → SUPERSEDED       on wallet replacement (PAYMENT_ROUTE claims)

RECHECK_REQUIRED
    → ACTIVE           on artifact restored (grace_expires_at cleared)
    → EXPIRED          on grace_expires_at reached
```

Expired, revoked, and superseded claims are retained in full. The claim record is never deleted.

### 4.4 Claim Supersession

When a wallet is rebound:
1. New `PAYMENT_ROUTE` claim created → `ACTIVE`
2. Prior `PAYMENT_ROUTE` claim → `SUPERSEDED`, `superseded_by` = new claim_id
3. Both records retained permanently

The supersession chain establishes complete routing history for the IX ID.

---

## Part 5: Account State Machine

### 5.1 Account States

An account state is distinct from claim states. An account can be `ACTIVE` while individual claims are `EXPIRED` or `NOT_PRESENT`.

| State | Payment routing | Profile visible | Notes |
|---|---|---|---|
| `REGISTERED` | Disabled | No | Email confirmed; no wallet bound yet |
| `ACTIVE` | Enabled | Yes | At least one `PAYMENT_ROUTE` claim is `ACTIVE` |
| `SUSPENDED` | Disabled | Restricted | Routing suspended; account history preserved; see §6 |
| `CLOSED` | Disabled | No | Account closed by controller; evidence retained per retention policy |
| `INVALID_ACTIVATION` | Disabled | No | Confirmed fraudulent registration; handle not recycled |

### 5.2 Account Transitions

```
REGISTERED
    → ACTIVE               on successful PAYMENT_ROUTE claim
    → SUSPENDED            on credible impersonation report or security determination
    → CLOSED               on controller request

ACTIVE
    → SUSPENDED            on credible impersonation report, security determination, or court order
    → CLOSED               on controller request

SUSPENDED
    → ACTIVE               on investigation resolution: account cleared
    → INVALID_ACTIVATION   on investigation resolution: impersonation confirmed
    → CLOSED               on controller request after reinstatement

INVALID_ACTIVATION         terminal; no outbound transitions
```

### 5.3 Account State vs. Claim State — Example

Maria's account is `ACTIVE`.

```
PAYMENT_ROUTE claim:      ACTIVE       (wallet bound 2026-08-17)
DOMAIN claim:             EXPIRED      (12-month window lapsed; badge hidden from UI)
BUSINESS_IDENTITY claim:  NOT_PRESENT  (never obtained)
```

UI displays: **Payment Route Verified**
UI does not display domain badge (claim is expired).
UI displays: **Business identity not verified.**

This is the correct behavior. The account is not suspended; the expired domain claim simply no longer generates a badge. Maria may renew the domain claim independently without any other account action.

---

## Part 6: Review Queue and SLA

### 6.1 Review Queue Entry Reasons

| Reason | Entry trigger | Default fail-safe |
|---|---|---|
| `NEW_ACTIVATION_RISK` | AI risk score exceeds threshold on new account | Fail closed: do not activate until resolved |
| `IMPERSONATION_REPORT` | Credible third-party complaint received | Immediate `PAYMENT_ROUTING_SUSPENDED`; see §7 |
| `PROFILE_ANOMALY` | AI detects post-activation impersonation signal | Fail open: account remains active unless evidence crosses suspension threshold |
| `DOMAIN_CONFLICT` | Claimed domain matches existing verified IX ID domain | Hold pending resolution |
| `INTERNAL_ESCALATION` | IX staff determination | Case-by-case |

The fail-safe is not universal. A suspicious new activation can safely be held. An established account with operational history should not be suspended on a weak automated signal alone.

### 6.2 Review Timestamps

```
review_case {
  case_id
  ix_id
  account_uid
  reason               // see 6.1
  entered_review_at
  initial_decision_due_at    // entered_review_at + SLA_INITIAL
  escalated_at               // null until escalated
  escalation_due_at          // escalated_at + SLA_ESCALATION
  resolved_at
  resolution             // CLEARED | SUSPENDED | INVALID_ACTIVATION | CLOSED
  resolved_by            // staff identifier or system
}
```

### 6.3 SLA Targets (v0.1 — subject to operational capacity)

| Review type | `SLA_INITIAL` | `SLA_ESCALATION` |
|---|---|---|
| `NEW_ACTIVATION_RISK` | 48 hours | 24 hours after escalation |
| `IMPERSONATION_REPORT` | 24 hours | 24 hours after escalation |
| `PROFILE_ANOMALY` | 72 hours | 48 hours after escalation |
| `DOMAIN_CONFLICT` | 48 hours | 24 hours after escalation |

Escalation is mandatory if `initial_decision_due_at` passes without resolution. Escalated cases require a second reviewer. A case that exceeds `escalation_due_at` without resolution triggers an operational alert — it does not auto-resolve.

**There is no default auto-resolution.** An unresolved case is an operational failure, not a policy outcome.

---

## Part 7: Incident Response — Impersonation

### 7.1 Trigger

A credible impersonation report is one that:
- Identifies a specific IX ID
- Provides a specific claim of impersonation (name, logo, address, or other representation)
- Is submitted by a party with a plausible relationship to the claimed identity (business owner, authorized representative, or an IX automated detection that reaches the impersonation threshold)

### 7.2 Immediate Action

Upon receipt of a credible impersonation report:

1. IX ID → `PAYMENT_ROUTING_SUSPENDED` (sub-state of `ACTIVE` or `SUSPENDED`)
2. Public IX ID page displays: *"This IX ID is temporarily unavailable for payments. If you have made a payment to this address, please contact IX ID support."*
3. Preservation hold applied to all records associated with the account
4. Review case created with reason `IMPERSONATION_REPORT`, `initial_decision_due_at` set

`PAYMENT_ROUTING_SUSPENDED` disables the payment overlay and removes the wallet address from the public profile. The IX ID handle remains reserved. Account history is preserved in full.

### 7.3 Evidence Assembled During Investigation

- Account creation timestamp and method
- Email address on record
- Authentication event history
- Wallet binding chain (all events, cryptographic evidence)
- Identity mutation log (complete — every profile change, timestamped)
- IX transaction references and Polygon tx hashes
- Complaint records and correspondence

### 7.4 Resolution Paths

| Finding | Account outcome | Handle outcome |
|---|---|---|
| Impersonation confirmed | `INVALID_ACTIVATION` | Not recycled; enters `INVALID_ACTIVATION` exception |
| False report | Reinstated; complaint recorded | No change |
| Ambiguous | Extended review; may remain suspended | No change until resolved |

### 7.5 Handle Policy — INVALID_ACTIVATION Exception

Confirmed fraudulent registrations do not follow ordinary handle expiry and recycling policy. The `INVALID_ACTIVATION` state is terminal and narrow:

- The handle is permanently removed from public registration availability
- The legitimate business may apply to register the handle through the Business Identity verification procedure (elevated assurance required)
- This exception class must not be applied loosely; it requires confirmed impersonation, not mere suspicion

This exception does not create a general mechanism for recycling handles. It addresses a specific fraud pattern where an activated handle was never a legitimate registration.

---

## Part 8: Evidence Invariants

### 8.1 What Is Never Deleted

- Wallet binding events (including superseded bindings)
- Verification claim records (including expired, revoked, superseded)
- Identity mutation events (all profile changes)
- Security events (auth events, IP-relevant events retained per retention schedule defined with counsel)
- Review case records
- Complaint records
- Suspension and reinstatement events
- IX transaction references (including associated Polygon tx hashes)

### 8.2 Retention of IP-Relevant Security Logs

Scope and retention duration for IP-associated security events is to be defined with counsel before production launch. Design principle: retain the minimum high-value evidence sufficient to establish what IX ID did and what the account controller proved to IX ID. Retention is not surveillance.

### 8.3 Preservation Holds

A preservation hold prevents deletion or expiry-based archival of records associated with a specified account for a defined period. Holds are triggered by:

- A valid preservation request from law enforcement
- A credible impersonation/fraud complaint (automatic for duration of review)
- An internal security incident designation

Preservation holds are logged. A hold is not a suspension; it is an evidence-layer instruction independent of account state.

### 8.4 The Historical/Current Distinction

Example: Maria's domain verification expires August 17, 2027.

**Current claim:** `DOMAIN` claim → `EXPIRED`. Badge removed from UI.

**Historical evidence:** The record that `mariastacos.com` control was successfully demonstrated on August 17, 2026, under evidence type `DNS_TXT`, with challenge nonce X, confirmed at T, verifier `IX_AUTOMATED`, is permanent and unmodified.

These are different objects. The current claim is a live assertion IX is making about the present. The historical record is a fact about the past that IX observed and cannot un-observe.

---

## Part 9: Law Enforcement Interface

### 9.1 What IX ID Can Assemble

For internal use and valid legal process:

- Account creation and identity record
- Wallet binding chain with cryptographic evidence
- Verification claim history
- Identity mutation log
- IX transaction references with Polygon tx hashes
- Security event summary (scope per counsel guidance)
- Complaint, suspension, and investigation timeline

The Polygon tx hashes provide investigators the bridge from IX ID's identity layer to on-chain forensic analysis.

### 9.2 Disclosure Requires Valid Legal Process

IP logs and sensitive security telemetry are not disclosed on informal request. Disclosure requires legally sufficient process (subpoena, court order, warrant) reviewed by counsel. Requests that do not satisfy the applicable standard are declined.

### 9.3 Emergency Requests

Process for requests asserting imminent harm: TBD with counsel before production launch. Design intent: emergency path exists; it is not the default path.

---

## Part 10: Open Questions for Counsel

The following require legal guidance before production launch:

1. What identity assurance level is required to activate public payment routing? (Email-only vs. stronger baseline)
2. IP log retention scope and duration
3. Emergency request handling requirements
4. Preservation hold obligations and process
5. Does operating ixid.me constitute money transmission in any jurisdiction, given that IX ID never holds funds?
6. Privacy policy requirements for the security event log
7. Handle policy for confirmed fraud — legal defensibility of `INVALID_ACTIVATION` exception
8. Business Identity verification procedure — acceptable evidence types and assurance standards

---

## Appendix A: Verification Claim Example Records

### A.1 PAYMENT_ROUTE claim — wallet bound via ETH_SIGN_CHALLENGE

```json
{
  "claim_id": "clm_pr_9f3a...",
  "ix_id": "mariastacos.ixid.me",
  "account_uid": "acc_84729",
  "claim_type": "PAYMENT_ROUTE",
  "subject": "0xABCD...1234",
  "evidence_type": "ETH_SIGN_CHALLENGE",
  "evidence_ref": "evt_wbind_7d2c...",
  "verified_at": "2026-08-17T14:00:00Z",
  "expires_at": null,
  "last_rechecked_at": null,
  "recheck_status": null,
  "assurance_level": "STANDARD",
  "verifier": "IX_AUTOMATED",
  "status": "ACTIVE",
  "superseded_by": null,
  "revocation_reason": null,
  "created_at": "2026-08-17T14:00:00Z"
}
```

### A.2 DOMAIN claim — verified via DNS_TXT, annual window

```json
{
  "claim_id": "clm_dom_2b8f...",
  "ix_id": "mariastacos.ixid.me",
  "account_uid": "acc_84729",
  "claim_type": "DOMAIN",
  "subject": "mariastacos.com",
  "evidence_type": "DNS_TXT",
  "evidence_ref": "evt_dnsverify_4a1e...",
  "verified_at": "2026-08-17T15:30:00Z",
  "expires_at": "2027-08-17T15:30:00Z",
  "supersedes": null,
  "last_rechecked_at": "2026-08-17T15:30:00Z",
  "recheck_required_at": null,
  "grace_expires_at": null,
  "expired_at": null,
  "verification_policy_version": "domain-v1",
  "assurance_level": "STANDARD",
  "verifier": "IX_AUTOMATED",
  "status": "ACTIVE",
  "superseded_by": null,
  "revocation_reason": null,
  "created_at": "2026-08-17T15:30:00Z"
}
```

### A.3 DOMAIN claim — in grace period (artifact absent 3 days)

Same claim record; no fields mutated except lifecycle timestamps and status.

```json
{
  "claim_id": "clm_dom_2b8f...",
  "verified_at": "2026-08-17T15:30:00Z",
  "expires_at": "2027-08-17T15:30:00Z",
  "supersedes": null,
  "status": "RECHECK_REQUIRED",
  "last_rechecked_at": "2026-09-17T03:00:00Z",
  "recheck_required_at": "2026-09-17T03:00:00Z",
  "grace_expires_at": "2026-10-01T03:00:00Z",
  "expired_at": null,
  "superseded_by": null,
  "verification_policy_version": "domain-v1"
}
```

Public badge at this point: **Domain Verification — Recheck Pending** / Previously verified Aug 17, 2026.

### A.3b DOMAIN renewal — verification chain

After annual renewal, two records exist. The new claim is created with all immutable fields set. The old claim receives lifecycle mutations (`status → SUPERSEDED`, `superseded_by` set) plus a corresponding transition event. Immutable evidentiary fields on the old claim — `verified_at`, `expires_at`, `evidence_ref`, etc. — are unchanged.

```json
// original claim — now SUPERSEDED, all fields immutable
{
  "claim_id": "clm_dom_2b8f...",
  "verified_at": "2026-08-17T15:30:00Z",
  "expires_at": "2027-08-17T15:30:00Z",
  "supersedes": null,
  "status": "SUPERSEDED",
  "superseded_by": "clm_dom_9c4a...",
  "expired_at": null
}

// renewal claim — ACTIVE, fresh ceremony
{
  "claim_id": "clm_dom_9c4a...",
  "verified_at": "2027-08-10T11:15:00Z",
  "expires_at": "2028-08-10T11:15:00Z",
  "supersedes": "clm_dom_2b8f...",
  "status": "ACTIVE",
  "superseded_by": null,
  "verification_policy_version": "domain-v1"
}
```

### A.4 Wallet binding evidence record

```json
{
  "event_id": "evt_wbind_7d2c...",
  "event_type": "WALLET_BIND",
  "ix_id": "mariastacos.ixid.me",
  "account_uid": "acc_84729",
  "wallet_address": "0xABCD...1234",
  "network": "polygon",
  "challenge_nonce": "ix_nonce_3f9a...",
  "challenge_issued_at": "2026-08-17T13:59:45Z",
  "signature": "0x...",
  "signature_verified": true,
  "binding_committed_at": "2026-08-17T14:00:00Z",
  "prior_wallet": null,
  "prior_claim_id": null,
  "method": "ETH_SIGN_CHALLENGE",
  "security_event_id": "sec_8b3c..."
}
```

---

*This document is the governing reference for IX ID identity and trust implementation. Implementation decisions that conflict with this specification must resolve the conflict by amending the specification — not by working around it.*

*v0.1 — Antoine Dennison / ImplicitEx — 2026-08-17*
