# IX ID Payment Route Management v0.1 — Recovery Candidate

Status: **RECOVERY CANDIDATE — UNSTAGED — NOT AUTHORITATIVE**
Recovery date: 2026-08-25
Governance lane: `m3-payment-route-contract-recovery`
Recovery input SHA-256: `02ccc1e5c1e5a16072378b90df7c3b7090dbf06b37f561d0b7712bf94cba9f9e`

This document is a newly governed contract candidate. It was independently
reasoned from the frozen IX ID contracts and reviewed propositions from a
quarantined, zero-authority draft. The draft's existence and wording confer no
authority. This candidate remains non-authoritative unless it later passes the
required reviews and receives explicit human commit/freeze authority.

M2 remains **OPEN/BLOCKED**. Nothing in this document waives, weakens, satisfies,
or reclassifies an M2 closure requirement. This document does not commence or
authorize M3 implementation.

---

## 1. Authority, scope, and normative language

### 1.1 Authoritative inputs

This candidate is constrained by the following committed authorities:

- `ixid-holder-authority-v0.1.md`, especially its stable Account/IX ID model,
  ownership rules, denial semantics, idempotency contract, direct-client denial,
  and mandatory future holder-mutation invariants;
- `ixid-identity-trust-architecture-v0.1.md`, especially identity continuity,
  claim/evidence separation, append-only history, and the IX ID/ImplicitEx
  boundary;
- `ixid-firestore-schema-v0.1.md`, especially the active PAYMENT_ROUTE claim
  pointer, `routing_suspended`, claim lifecycle, evidence reconstruction, and
  trusted-service enforcement boundaries; and
- `ixid-onboarding-v0.1.md`, especially server-side verified-email admission and
  §15.1's M2 OPEN/BLOCKED sequence exception.

If this candidate conflicts with a frozen authority, the frozen authority wins.
Implementation convenience never resolves a conflict.

### 1.2 Normative terms

`MUST`, `MUST NOT`, `REQUIRED`, `SHALL`, and `SHALL NOT` are normative.
`SHOULD` describes a strong recommendation that requires documented review to
depart from. `MAY` is optional within the stated boundary.

### 1.3 M3 outcome

M3 defines a controller-authorized declaration and management contract for one
Polygon-native-USDC destination associated with an IX ID. M3 does not prove
wallet control and cannot make a route payable. A route created by M3 begins in
`PENDING_OWNERSHIP_PROOF`.

M4, under its own future contract and authority, may prove control and create an
ACTIVE `PAYMENT_ROUTE` verification claim. M6 or another separately governed
transaction layer may later consume an eligible resolution. Neither operation
is part of M3.

### 1.4 Explicitly excluded

This contract does not authorize or specify executable implementation, service
topology, physical database paths, UI, wallet connection, proof ceremony,
transaction construction, signing, custody, blockchain submission, deployment,
provider configuration, Firebase/GCP/network mutation, fees, or production
activation.

---

## 2. Core identity and route invariants

### 2.1 Identity continuity

The canonical IX ID handle is the persistent public identity. The opaque
`account_id` is the stable controller identity. An authentication principal is
only a credential mapped to that account. A destination address is a routing
target, never the IX ID or account identity.

Changing a destination MUST NOT change the IX ID, `account_id`, or existing
historical evidence. Authentication-method recovery that preserves
`account_id` also preserves route-management authority, subject to current
account and IX ID state.

### 2.2 Route identity

Each declaration creates a fresh, opaque `route_id`. A `route_id` identifies one
immutable tuple:

```
(ix_id, route_generation, network_binding, asset_binding,
 destination_address, declared_by_account_id, declared_at)
```

The destination address, network binding, and asset binding MUST NOT be changed
in place. A destination change creates a new `route_id`; the prior route becomes
historical. This prevents identity ambiguity and makes wallet changes auditable.

### 2.3 One head and at most one payable route

Each IX ID has at most one route head: the most recently accepted declaration,
including a terminal head. It also has at most one payable route. These are
different concepts:

- `head_route_id` identifies the latest declaration and may point to a pending,
  active, disabled, or revoked record.
- `active_payment_route_claim_id` identifies the current ACTIVE verified claim,
  if any, under the frozen trust schema.
- `routing_suspended` is an independent fail-closed eligibility gate.

The mere existence of a route record or claim pointer MUST NOT imply payability.

### 2.4 Fail-closed payability

A route is payable only when every condition in §8.2 is true. Missing,
inconsistent, pending, terminal, stale, suspended, or unverified state always
resolves as not payable. There is no fallback to a prior, pending, client-supplied,
or merely present address.

---

## 3. Network, asset, and destination binding

### 3.1 Network authority

The only M3 v0.1 network is Polygon PoS mainnet with numeric `chain_id = 137`.
The canonical internal network identifier SHALL encode the namespace and numeric
chain ID, not a display label alone. `POLYGON`, `MATIC`, or other aliases are not
sufficient authority.

Network selection is server-contract authority, not controller input. If a
transport includes a chain assertion, it is an expectation to compare against
the fixed binding; it cannot select or override the binding. Any mismatch fails
closed.

### 3.2 Asset authority

The only M3 v0.1 asset is Circle-issued native USDC on `chain_id = 137`. The
authoritative asset identity MUST include all of:

```
chain_id = 137
token_standard = ERC20
token_contract_address = one exact human-reviewed 20-byte address
asset_symbol = USDC (display metadata only; never sufficient identity)
asset_binding_version = immutable policy identifier
```

USDC.e, bridged USDC, wrapped assets, symbol-only matches, and contracts on any
other network MUST be rejected. No fallback or automatic substitution is
permitted.

The exact token contract address and the repository authority that supplies it
are deferred in D-1. M3 implementation cannot begin until that value is adopted
under authorized review and mechanically pinned. Runtime discovery, RPC probing,
or a mutable provider response MUST NOT silently choose the asset.

### 3.3 Destination canonicalization

A destination is a 20-byte EVM address. The canonical stored and compared form is
`0x` followed by 40 lowercase hexadecimal characters.

Input validation MUST:

1. require exactly 20 bytes represented as 40 hex characters with `0x` prefix;
2. reject the zero address;
3. accept all-lowercase canonical input;
4. accept mixed-case input only if its EIP-55 checksum is valid, then normalize;
5. reject whitespace, truncation, non-hex characters, and malformed length; and
6. perform no network call merely to validate syntax.

Whether a destination is an EOA or contract is not inferred in M3. Contract
destinations are neither silently accepted as safe nor categorically rejected by
this contract; any future restriction requires separate policy authority.

---

## 4. Logical contract model

This section defines observable logical facts, not physical Firestore collection
names or application classes.

### 4.1 IX ID route aggregate

For each IX ID, the authoritative route aggregate contains or derives:

| Field | Contract meaning |
|---|---|
| `head_route_id` | Latest route record, or null before any declaration |
| `route_generation` | Monotonic count of accepted route declarations; starts at 0 |
| `ix_id_state_version` | Frozen global CAS revision for existing-holder mutations |
| `active_payment_route_claim_id` | Frozen pointer to current ACTIVE claim, or null |
| `routing_suspended` | Independent payment-eligibility denial gate |
| `routing_suspended_at` | Current suspension timestamp as defined by frozen schema |
| `routing_suspension_reason` | Stable reason code for the current suspension |

`ix_id_state_version` is the authoritative caller-visible mutation revision.
Route operations MUST NOT invent a replacement CAS token that bypasses it.

### 4.2 Route record

Immutable facts established at declaration:

| Field | Requirement |
|---|---|
| `route_id` | IX-generated opaque identifier |
| `ix_id` | Canonical handle |
| `declared_by_account_id` | Server-resolved stable account; never client-supplied |
| `route_generation` | Prior aggregate generation + 1 |
| `network_id` | Canonical binding for `chain_id = 137` |
| `asset_binding_id` | Immutable versioned native-USDC binding |
| `destination_address` | Canonical lowercase address |
| `declared_at` | Authoritative commit time |
| `creation_operation_id` | Idempotency operation identifier |
| `predecessor_route_id` | Prior head, or null for first declaration; does not imply a terminal predecessor changes state |

Lifecycle facts:

| Field | Requirement |
|---|---|
| `status` | State from §5 |
| `status_version` | Starts at 0 and increments exactly once per route transition |
| `status_changed_at` | Evidence timestamp, not ordering authority |
| `superseded_by_route_id` | Set only on supersession |
| `verification_claim_id` | Null in M3; may be set only by authorized M4 activation |

No route record may be physically deleted. Immutable facts MUST NOT be updated.

### 4.3 Route event

Every route creation or lifecycle transition MUST atomically append an immutable
event containing enough information to reconstruct the route history without the
materialized aggregate or route record. At minimum:

```
event_id, operation_id, operation_type, ix_id, route_id,
from_status, to_status, prior_status_version, resulting_status_version,
prior_ix_id_state_version, resulting_ix_id_state_version,
actor, occurred_at, reason_code,
immutable_route_facts_on_creation,
predecessor_route_id, successor_route_id
```

Events are private authority evidence. They may contain the canonical destination
needed for reconstruction; public and operational logging rules remain governed by
§10.

### 4.4 Operation receipt

Every successful mutation consumes its caller-supplied `operation_id` in the same
atomic commit. The receipt binds at least:

```
principal_identity_key
resolved_account_id
operation_type
canonical_ix_id
expected_ix_id_state_version
expected_head_route_id
expected_route_status_version (when a head is targeted)
canonical_destination (for declaration/replacement)
network_id
asset_binding_id
payload_fingerprint
resulting_ix_id_state_version
resulting_route_id
```

The payload fingerprint uses an unambiguous canonical encoding with length framing
or an equivalently collision-safe structure. Human-readable concatenation without
framing is prohibited.

---

## 5. Lifecycle and destination mutation

### 5.1 States

| State | Meaning | Payable? |
|---|---|---|
| `PENDING_OWNERSHIP_PROOF` | Controller declared route; control not proven | No |
| `ACTIVE` | M4 proof succeeded and active claim/route binding is consistent | Potentially; §8.2 still governs |
| `DISABLED` | Controller disabled routing through this record | No; terminal |
| `SUPERSEDED` | A newer declaration replaced this record | No; terminal |
| `REVOKED` | Authorized trust/safety action revoked this record | No; terminal |

`ACTIVE` creation is outside M3. `REVOKED` transitions require separate
administrative authority. M3 may create pending routes and may disable or
supersede the current head.

### 5.2 Legal transitions

```
[no head]                 -- DECLARE --> PENDING_OWNERSHIP_PROOF
PENDING_OWNERSHIP_PROOF   -- REPLACE --> SUPERSEDED + new PENDING record
PENDING_OWNERSHIP_PROOF   -- DISABLE --> DISABLED
ACTIVE                    -- REPLACE --> SUPERSEDED + new PENDING record
ACTIVE                    -- DISABLE --> DISABLED
PENDING_OWNERSHIP_PROOF   -- M4 proof --> ACTIVE       (M4 only)
ACTIVE                    -- REVOKE --> REVOKED         (future admin authority)
PENDING_OWNERSHIP_PROOF   -- REVOKE --> REVOKED         (future admin authority)
DISABLED                  -- DECLARE NEW --> DISABLED unchanged + new PENDING head
REVOKED                   -- DECLARE --> DENIED (separate recovery authority required)
```

Terminal records never transition out. A later declaration after a `DISABLED` head
creates a new pending record with a new `route_id` and generation while the disabled
record remains unchanged. A `REVOKED` head blocks controller declaration until a
separately authorized administrative recovery decision exists. A `SUPERSEDED` record
cannot be the authoritative head while its successor exists.

### 5.3 Declaration, replacement, and routing suspension

Declaration and replacement are never in-place address updates. In one atomic
operation the authority MUST:

1. compare all expected revisions and authority facts;
2. reject a `REVOKED` head pending separate recovery authority;
3. create the new pending route and creation event, linking its immutable
   `predecessor_route_id` when a prior head exists;
4. if the prior head is `PENDING_OWNERSHIP_PROOF` or `ACTIVE`, transition it to
   `SUPERSEDED` and append its event; if it is `DISABLED`, leave it unchanged;
5. advance `head_route_id` and `route_generation`;
6. set `routing_suspended = true`, `routing_suspended_at` to the authoritative
   commit time, and `routing_suspension_reason = PENDING_OWNERSHIP_PROOF` before
   the new route can be observed;
7. increment `ix_id_state_version` exactly once; and
8. write the operation receipt.

If the prior route was ACTIVE, M3 does not create, activate, revoke, or supersede
its PAYMENT_ROUTE verification claim. The still-preserved claim records what was
proven; `routing_suspended = true` prevents it from being used for payment. A
future M4 cutover must reconcile claim supersession and the new active route
atomically under M4 authority.

This separation repairs the quarantined draft's contradiction between “M3 cannot
write the active claim” and “replacement immediately revokes payability.” M3 may
only close the eligibility gate; it cannot manufacture verification authority.

### 5.4 Disable

Disabling the head MUST atomically transition it to `DISABLED`, set
`routing_suspended = true`, set `routing_suspended_at` to the authoritative commit
time, set `routing_suspension_reason = CONTROLLER_DISABLED`, increment route
`status_version`, increment `ix_id_state_version` exactly once, append the event,
and write the receipt.

Disabling an ACTIVE route does not erase or rewrite its verification evidence.
Re-enabling a disabled record is prohibited. A future route begins as a new pending
record and requires fresh proof before routing can resume.

### 5.5 M4 activation interface

M3 reserves, but does not implement, this fail-closed boundary. A future M4
operation may make a pending route ACTIVE only if it atomically:

- revalidates current controller/account/IX ID authority and expected revisions;
- verifies control of the pending destination under an authorized proof contract;
- creates the immutable wallet-binding evidence and PAYMENT_ROUTE claim;
- transitions the pending route to ACTIVE and links the claim;
- supersedes any prior active PAYMENT_ROUTE claim as required by frozen claim
  lifecycle authority;
- sets `active_payment_route_claim_id` to the new claim;
- sets `routing_suspended = false` only after all preceding facts are consistent;
- increments all required state versions and appends all required events; and
- commits all effects atomically.

The proof protocol, challenge format, signature rules, policy version, and physical
schema delta are D-2 and require an M4 contract. M3 provides no shortcut.

---

## 6. Controller authority and admission

### 6.1 Authority derivation

The server derives the exact auth `identity_key`, stable `account_id`, and owned
IX ID from the verified authentication principal and authoritative mappings. A
client-supplied `account_id`, owner, or target IX ID is never authority.

For mutations, all of these MUST be true both before and inside the atomic commit:

- authentication token authentic and pinned to the authorized Firebase project;
- `email_verified == true` under the M2 mutation-admission rule;
- auth identity ACTIVE;
- account ACTIVE;
- `accounts.owned_ix_id` equals the canonical IX ID;
- IX ID ACTIVE;
- `ix_ids.owner_account_id` equals the resolved account; and
- expected revisions and route identifiers match.

Any TOCTOU change before commit causes denial or transaction re-evaluation, never a
partial write.

### 6.2 Read authority

An ACTIVE or SUSPENDED account may read its own latest route state through an
authenticated, non-cacheable owner surface. DISABLED or CLOSED accounts receive
denial. Pending destination data MUST NOT be exposed to other controllers or the
public resolver.

### 6.3 Cross-owner privacy

For an existing-state mutation, “IX ID absent” and “IX ID owned by another account”
MUST produce the same external `NOT_FOUND_OR_NOT_AUTHORIZED` response. Internal
reason detail may exist only in access-controlled operational telemetry.

---

## 7. Mutation, CAS, and idempotency contract

### 7.1 Logical commands

M3 has two logical mutation commands:

```
DECLARE_OR_REPLACE_ROUTE(
  operation_id,
  expected_ix_id_state_version,
  expected_head_route_id,
  expected_head_status_version,
  destination_address
)

DISABLE_ROUTE(
  operation_id,
  expected_ix_id_state_version,
  expected_head_route_id,
  expected_head_status_version
)
```

The first declaration uses `expected_head_route_id = null` but still supplies the
current `expected_ix_id_state_version`; an IX ID is not a version-zero object merely
because it has no route. Transport names and request encoding are implementation
choices, but no transport may weaken these inputs.

### 7.2 CAS ordering

Inside one atomic authority boundary, a new operation MUST:

1. re-read the operation receipt;
2. on no matching receipt, re-read auth/account/IX ID/head state;
3. require current `ix_id_state_version == expected_ix_id_state_version`;
4. require current head and status version equal the supplied expectations;
5. re-check the legal transition and immutable binding;
6. write all state, events, and receipt atomically; and
7. set resulting `ix_id_state_version = expected + 1` exactly.

A stale global revision returns `STALE_IX_ID_STATE_VERSION` with the current
revision only to the authenticated owner. A stale head identifier or status version
returns `STALE_PAYMENT_ROUTE`. The caller must re-read before creating a new logical
operation. Blind retry with a new `operation_id` is prohibited.

### 7.3 Concurrent mutations

Two commands based on the same expected revision cannot both commit. Exactly one may
advance the revision. Every loser re-evaluates after contention and returns a stale
response with zero authoritative writes. No race may create two heads, two payable
routes, a head/event mismatch, or an unreceipted mutation.

### 7.4 Idempotent replay

Receipt lookup precedes ordinary state-conflict checks. An exact receipt match proves
the logical operation already committed. The authority then revalidates current auth
and account access and returns the current authoritative route snapshot without
reapplying the mutation or writing another event.

Reuse of an `operation_id` with any different bound field returns
`IDEMPOTENCY_CONFLICT` and zero writes. A receipt/account inconsistency is an internal
integrity failure, never a reason to guess or repair state in the request path.

### 7.5 Denial is write-free

Authentication, authorization, validation, CAS, idempotency-conflict, terminal-state,
and binding denials produce zero writes to authoritative state, events, or receipts.
Rate-limit telemetry, if later authorized, remains non-authoritative.

---

## 8. Resolver and payment-handoff contract

### 8.1 Private owner view versus public resolution

The owner surface may return the current head, including pending or terminal status,
destination, generation, status version, and current `ix_id_state_version`.

The public resolver MUST NOT expose a pending destination, terminal destination,
account identifier, auth identifier, denial reason, or route history. A non-payable
response is generic.

### 8.2 Eligibility predicate

A public resolution is `PAYABLE` only if one atomic/consistent read establishes:

1. current account state is ACTIVE;
2. current IX ID state is ACTIVE;
3. `routing_suspended == false`;
4. `active_payment_route_claim_id` is non-null;
5. the referenced claim exists, is `PAYMENT_ROUTE`, and is ACTIVE;
6. exactly one route record is ACTIVE and linked to that claim;
7. route destination equals the normalized claim subject;
8. route/wallet evidence network equals `chain_id = 137`;
9. route asset binding equals the currently authorized native-USDC binding; and
10. all cross-references and versions are internally consistent.

Failure of any predicate returns `NOT_PAYABLE`. No partial tuple is returned.

### 8.3 Payable resolution envelope

A payable resolution MUST bind at least:

```
ix_id
route_id
route_generation
ix_id_state_version
payment_route_claim_id
destination_address
chain_id = 137
token_contract_address
asset_binding_version
resolved_at
resolver_policy_version
resolution_fingerprint
```

The fingerprint covers the canonical encoding of every payment-relevant field. It is
an integrity/correlation value, not a bearer credential and not proof that state
remains current.

### 8.4 Sender handoff and stale state

The transaction layer MUST bind a proposed payment to the entire resolution tuple,
not to an IX ID or address alone. Before the first irreversible action—normally
signing or submission—it MUST use a separately governed freshness/revalidation
protocol. It MUST abort if the route is no longer payable, any bound field changed,
or freshness cannot be proven.

There is no fallback to the previous address, no automatic network/asset switch, and
no “best effort” payment. A route change after an on-chain transaction is submitted
cannot recall that transaction; this is the explicit boundary of IX ID authority.

Exact transport, maximum resolution age, cache headers, and atomic revalidation
mechanism are D-3 for the M6/payment-handoff contract. A fixed 30-second cache is not
adopted as a correctness guarantee.

### 8.5 Non-custodial guarantee

M3 stores routing declarations and evidence only. It MUST NOT request, receive,
derive, store, transmit, or log a private key, mnemonic, signing credential, token
approval, raw wallet signature, or transaction authorization. It cannot move funds,
choose payment amounts, collect fees, sign, or submit transactions.

---

## 9. Error semantics

Stable logical error codes are normative; exact HTTP routes and response shapes are
future transport choices.

| Code | Meaning | Write effect |
|---|---|---|
| `UNAUTHENTICATED` | Token invalid, wrong audience, missing mapping, or unverified email for mutation | Zero |
| `ACCESS_DENIED` | Account state does not permit requested owner action | Zero |
| `NOT_FOUND_OR_NOT_AUTHORIZED` | Target absent or not owned; indistinguishable externally | Zero |
| `INVALID_DESTINATION_ADDRESS` | Destination fails §3.3 | Zero |
| `ROUTE_BINDING_UNAVAILABLE` | Canonical chain/asset authority missing or inconsistent | Zero |
| `STALE_IX_ID_STATE_VERSION` | Frozen global CAS revision differs | Zero |
| `STALE_PAYMENT_ROUTE` | Expected head/status version differs | Zero |
| `NO_PAYMENT_ROUTE` | Disable requested before any head exists | Zero |
| `ROUTE_ALREADY_TERMINAL` | Target route cannot transition | Zero |
| `ROUTE_RECOVERY_REQUIRED` | Current head is revoked; controller declaration requires separate authority | Zero |
| `IDEMPOTENCY_CONFLICT` | Operation identifier binding differs | Zero |
| `INTERNAL_AUTHORITY_INCONSISTENCY` | Authoritative cross-references disagree | Zero; alert |

Public resolution has only `PAYABLE`, generic `NOT_PAYABLE`, or public-identity
absence. It MUST NOT disclose which eligibility predicate failed.

---

## 10. Security, privacy, and evidence

### 10.1 Direct-client denial

Untrusted clients MUST have no direct read or write access to authority collections,
route records, route events, receipts, auth mappings, or private pending-route data.
All owner operations flow through the existing authenticated holder-authority
boundary. Public reads flow through a read-only projection/resolver boundary.

Physical Security Rules, IAM, service names, and deployment topology are future
implementation artifacts; they must enforce this contract and the frozen three-layer
boundary rather than redefine it.

### 10.2 Data exposure

- A pending destination is visible only to its authorized controller and restricted
  authority/review systems.
- A payable destination, chain, asset binding, claim ID, route ID, and revision are
  public because senders require them.
- Stable `account_id`, auth subject, raw token, receipt contents, and private history
  are never public.
- Operational logs MUST exclude bearer tokens, raw auth subjects, private keys,
  signatures, and pending destination addresses.
- Where correlation is required, logs SHOULD use a domain-separated digest rather
  than a raw destination or stable account identifier.

### 10.3 Auditability

Authoritative route history is append-only and reconstructable. A reconstruction
test MUST prove, from route events and linked claim/evidence events, the declaration
order, every status transition, global and local version continuity, controller
authority, predecessor/successor chain, routing-suspension changes, and active-claim
cutovers.

Timestamps are evidence but not ordering authority. Version sequences and immutable
operation identifiers establish order. Deletion, gap filling, event rewriting, and
history normalization are prohibited.

### 10.4 Replay and stale-state threats

The design addresses distinct threats separately:

- operation replay: fully bound idempotency receipt;
- concurrent mutation: global `expected_ix_id_state_version` CAS plus route head/status
  expectations;
- resolver replay: full resolution tuple plus payment-time freshness check;
- credential replay after suspension/revocation: current authority revalidation;
- old-address reuse: fresh `route_id`, monotonic generation, and no in-place mutation;
- asset/network confusion: exact fixed binding, no symbol/alias fallback.

### 10.5 Rate limiting

Mutations require abuse controls, but a numeric limit and enforcement mechanism are
D-4. They are operational policy, not a reason to guess inside this contract. Any
future limit MUST be server-enforced, must not become authorization, and must preserve
zero authoritative writes on denial.

---

## 11. Normative contract versus implementation choices

### 11.1 Normative now

The following are contract requirements:

- identity/account continuity;
- fresh route identity on destination change;
- chain 137 and exact native-USDC contract binding;
- pending-first lifecycle and M4-only activation;
- `routing_suspended` fail-closed replacement/disable behavior;
- frozen global revision CAS and N→N+1 transition;
- fully bound idempotency and zero-write denials;
- atomic state/event/receipt changes;
- append-only evidence and reconstruction;
- private pending data and generic public non-payability;
- full resolver tuple and stale-handoff rejection; and
- no custody, signing, payment execution, or implementation authority.

### 11.2 Deferred implementation choices

The following require later explicit authority and MUST NOT be inferred from this
candidate:

| ID | Deferred question | Required before |
|---|---|---|
| D-1 | Exact full Polygon native-USDC token contract address, authoritative repository source, and immutable asset-binding policy version | M3 implementation contract/freeze |
| D-2 | M4 proof protocol, challenge/signature policy, physical claim/route linkage, and atomic activation/cutover procedure | M4 contract/freeze |
| D-3 | API/transport names, resolver freshness window, cache policy, and payment-time revalidation handshake | Relevant M3 transport and M6 handoff contracts |
| D-4 | Mutation rate-limit values and enforcement mechanism | Production implementation/operations review |
| D-5 | Physical persistence paths, indexes, migration/backfill plan, and absent-versus-null compatibility | M3 implementation design after M2 closure |

No deferred item may be resolved by runtime guess, live-infrastructure inspection,
provider default, or source-draft assertion.

---

## 12. Acceptance criteria for a future implementation

This section defines mechanically testable obligations. It does not authorize their
implementation while M2 remains OPEN/BLOCKED.

### 12.1 Model and authority tests

1. An auth method change preserving `account_id` preserves route authority and IX ID.
2. A client-supplied account/IX ID cannot redirect authority.
3. Unverified email, non-ACTIVE account, or non-ACTIVE IX ID mutation is denied with
   zero authoritative writes.
4. Cross-owner and absent targets are externally indistinguishable.
5. SUSPENDED accounts may read only their own route and cannot mutate it.

### 12.2 Creation, replacement, and disable tests

6. First declaration creates exactly one pending route, one creation event, one
   receipt, advances generation, sets the head, sets routing suspension, and advances
   `ix_id_state_version` exactly once.
7. Replacing a pending or active destination creates a new `route_id`; the prior
   immutable destination is unchanged and the prior record becomes `SUPERSEDED`.
   Declaring after `DISABLED` creates a new record without changing the disabled one;
   declaring after `REVOKED` is denied pending separate authority.
8. Replacing an ACTIVE route atomically sets `routing_suspended = true`; a resolver
   can never expose the old active claim after replacement commits.
9. Disable creates no new route, marks the head terminal, suspends routing, appends
   one event, and advances the global revision exactly once.
10. A terminal record never re-enters pending or active state.

### 12.3 CAS and idempotency tests

11. Two commands with the same expected global revision yield exactly one commit and
    one stale denial; no partial records or duplicate head exist.
12. Exact operation replay revalidates current authority, performs zero writes, and
    returns current authoritative state.
13. Operation-ID reuse with a different destination, expected revision, head,
    account, IX ID, network, or asset binding returns `IDEMPOTENCY_CONFLICT`.
14. Stale global revision and stale route status are separately detectable.
15. Every successful existing-state mutation commits global revision `N+1`, and the
    receipt/event agree with that value.

### 12.4 Binding and resolver tests

16. Malformed, zero, or invalid mixed-case addresses are rejected before mutation.
17. A chain other than 137, wrong token contract, USDC.e, symbol-only identity, or
    missing asset authority fails closed.
18. Pending, disabled, superseded, revoked, suspended, missing, or inconsistent state
    resolves only as generic `NOT_PAYABLE`, with no destination leakage.
19. A payable response contains the full §8.3 tuple and a fingerprint covering it.
20. A payment handoff using a stale or changed tuple aborts before signing/submission.

### 12.5 Evidence and boundary tests

21. Route events alone plus linked frozen claim/evidence events reconstruct every
    declaration, transition, version, predecessor, and cutover without timestamp
    ordering.
22. Direct unauthenticated and Firebase-authenticated client reads/writes to private
    route authority data are denied.
23. No token, raw auth subject, key, mnemonic, signature, or pending address appears
    in operational logs.
24. Denial paths write no route, event, IX ID, claim, or receipt state.
25. M3 code cannot set a route ACTIVE, set an active claim pointer, unsuspend routing,
    execute a payment, sign, or submit a transaction.

### 12.6 Contract/governance gates

26. D-1 and D-5 are resolved by authorized contract/implementation design before M3
    implementation begins.
27. M2 satisfies every existing closure requirement before formal M3 implementation.
28. M4 and M6 behaviors remain unavailable until their own contracts and lanes exist.

---

## 13. Falsification cases

| Attack or failure | Required result |
|---|---|
| Controller B targets Controller A's IX ID | `NOT_FOUND_OR_NOT_AUTHORIZED`; zero writes |
| Client includes `status=ACTIVE` | Field rejected/ignored by schema; created route remains pending |
| Client supplies chain alias or token symbol | Cannot select binding; mismatch fails closed |
| Two replacements race | One commit; one stale denial; one head |
| Old operation ID reused for another IX ID | `IDEMPOTENCY_CONFLICT`; zero writes |
| Active route replaced while old claim remains ACTIVE | `routing_suspended=true`; public result not payable |
| Projection sees pending route record | Still cannot expose it through public resolver |
| Cached payable tuple used after route revision changes | Payment-time revalidation fails; abort before irreversible action |
| Account or IX ID suspended after owner read | Commit-time check or resolver predicate denies |
| Materialized route record lost | Append-only events reconstruct authoritative history; integrity alert |

---

## 14. Recovery provenance ledger

### 14.1 Method

The quarantined source was considered section by section after its digest matched the
recorded quarantine identity. Each row below has exactly one disposition. `ADOPT`
means the proposition survived independent reasoning substantially intact. `ADOPT
WITH MODIFICATION` means the useful intent was retained but corrected or narrowed.
`REJECT` means it is intentionally excluded. `DEFER` means current authority is
insufficient and the question is named in §11.2 or a later milestone boundary.

The authoritative basis is the current frozen contract set, not the quarantined
source. “Result” points to this candidate.

### 14.2 Section and proposition dispositions

| ID | Source locator | Disposition | Independent rationale / authoritative basis | Result |
|---|---|---|---|---|
| P-01 | Relationship to frozen documents | ADOPT WITH MODIFICATION | M3 must extend without silently amending frozen contracts; physical schema assertions are not yet authorized. | §§1, 11 |
| P-02 | Purpose | ADOPT WITH MODIFICATION | Declaration-before-proof matches the M3→M4 sequence; payability and implementation claims are narrowed. | §§1.3, 2.4 |
| P-03 | §1.1 route concept | ADOPT WITH MODIFICATION | Trust I-1 makes IX ID stable; a fresh immutable `route_id` is required for each destination. | §§2.1–2.2 |
| P-04 | §1.2 one active route | ADOPT WITH MODIFICATION | One route head and one payable route are distinct invariants and must not be conflated. | §2.3 |
| P-05 | §1.3 M3 fail-closed | ADOPT | Pending declarations cannot be public/payable without verified-claim authority. | §§2.4, 8.2 |
| P-06 | Part 2 network/asset invariant | ADOPT WITH MODIFICATION | Chain 137/native USDC are fixed; client selection and runtime discovery are rejected; exact contract authority is D-1. | §3, D-1 |
| P-07 | §3.1 route states | ADOPT WITH MODIFICATION | States are useful, but ACTIVE/admin transitions are reserved to later authorities and routing eligibility is separate. | §5.1 |
| P-08 | §3.2 state machine | ADOPT WITH MODIFICATION | Legal transitions are retained with atomic suspension and explicit M4/admin boundaries. | §§5.2–5.5 |
| P-09 | §3.3 deletion policy | ADOPT | Frozen evidence invariants require permanent append-only history. | §§4.2–4.3, 10.3 |
| P-10 | §3.4 replacement | ADOPT WITH MODIFICATION | Fresh route identity is retained; global M1 CAS and `routing_suspended` repair the active-route contradiction. | §§5.3, 7 |
| P-11 | §3.5 no active route | ADOPT WITH MODIFICATION | All ineligible states are non-payable; owner-private and public views are separated. | §§6.2, 8.1–8.2 |
| P-12 | §4.1 manager authority | ADOPT WITH MODIFICATION | Authority derives from verified principal→account→IX ID mappings and current M2 admission, never request identity. | §6 |
| P-13 | §4.2 M3 validation without M4 | ADOPT WITH MODIFICATION | M3 validates syntax and fixed binding but does not prove control; network/asset are not client choices. | §§3, 5.1 |
| P-14 | §4.3 fail-closed structure | ADOPT WITH MODIFICATION | M3 cannot set active claims but may set frozen `routing_suspended=true`; resolver checks the full predicate. | §§5.3–5.4, 8.2 |
| P-15 | §4.4 detailed M4 ceremony | DEFER | Exact proof, signature, claim-link, and cutover authority belongs to M4. | §5.5, D-2 |
| P-16 | §5.1 exact service routing | DEFER | Existing authority boundary is normative; endpoint topology and service routing are implementation choices. | §§10.1, 11.2 D-3 |
| P-17 | §5.2 authentication requirements | ADOPT WITH MODIFICATION | Frozen M1 resolution plus M2 verified-email mutation admission govern; suspended reads remain read-only. | §6 |
| P-18 | §5.3 owner GET contract | ADOPT WITH MODIFICATION | Owner-readable latest state is required, but exact URI/JSON transport is deferred. | §§6.2, 8.1 |
| P-19 | §5.4 set/replace API | ADOPT WITH MODIFICATION | Logical command and outcomes retained; global CAS, head identity, and fixed binding replace premature transport schema. | §§7.1–7.3 |
| P-20 | §5.5 disable API | ADOPT WITH MODIFICATION | Disable is retained with atomic routing suspension, versions, evidence, and no re-enable. | §§5.4, 7 |
| P-21 | §5.6 idempotency | ADOPT WITH MODIFICATION | M1 replay semantics retained; binding now includes global revision, head/status, account, network, and asset. | §§4.4, 7.4 |
| P-22 | §5.7 stale revision | ADOPT WITH MODIFICATION | Frozen Part 10 requires `expected_ix_id_state_version` and N→N+1, not route-only CAS. | §§4.1, 7.2 |
| P-23 | §6.1 schema additions | ADOPT WITH MODIFICATION | Logical facts are specified; premature Firestore paths and invented active-address field are excluded. | §4, D-5 |
| P-24 | §6.2 atomicity | ADOPT WITH MODIFICATION | Atomic outcomes are normative without prescribing Firestore transaction steps or class names. | §§5.3–5.4, 7.2 |
| P-25 | §6.3 concurrency | ADOPT WITH MODIFICATION | Contention must serialize on frozen global revision plus exact head/status expectations. | §7.3 |
| P-26 | §6.4 denial writes | ADOPT | Frozen M1 denial invariant requires zero authoritative writes. | §7.5 |
| P-27 | §7.1 payment-read needs | ADOPT WITH MODIFICATION | Sender needs a complete verified tuple and revision, not merely an address. | §8.3 |
| P-28 | §7.2 public endpoint | ADOPT WITH MODIFICATION | A generic resolver contract is retained; exact endpoint/projection implementation is deferred. | §§8.1–8.3, D-3 |
| P-29 | §7.3 no payment execution | ADOPT | IX ID/ImplicitEx separation and this lane prohibit execution. | §§1.4, 8.5 |
| P-30 | §7.4 fixed 30-second cache | REJECT | A time-only cache can route to superseded state; payment-time tuple revalidation is required and numeric TTL is deferred. | §8.4, D-3 |
| P-31 | §8.1 address validation | ADOPT WITH MODIFICATION | Exact byte length, zero rejection, checksum treatment, and deterministic normalization are specified without RPC. | §3.3 |
| P-32 | §8.2 chain/asset validation | ADOPT WITH MODIFICATION | Server contract fixes chain/asset; exact token contract, not enum/symbol, is authority. | §§3.1–3.2 |
| P-33 | §8.3 authorization checks | ADOPT WITH MODIFICATION | Current auth/account/ownership/IX state and commit-time checks are preserved with non-enumerating denial. | §6 |
| P-34 | §8.4 numeric rate limit | DEFER | Abuse control is required, but value and mechanism need operational authority. | §10.5, D-4 |
| P-35 | §8.5 no key material | ADOPT | Non-custodial M3 never handles secrets, signatures, or transaction authority. | §8.5 |
| P-36 | §8.6 logging/redaction | ADOPT WITH MODIFICATION | Data minimization and domain-separated correlation are retained without dictating a provider sink. | §10.2 |
| P-37 | §8.7 Firestore rules | ADOPT WITH MODIFICATION | Direct-client denial is normative; exact rule text/physical paths await implementation. | §10.1, D-5 |
| P-38 | Part 9 non-goals | ADOPT WITH MODIFICATION | Implementation, M4/M6, multi-route, custody, provider, and unrelated roadmap work remain excluded; stale Slice-I claims are removed. | §§1.4, 11 |
| P-39 | Part 10 acceptance criteria | ADOPT WITH MODIFICATION | Useful behaviors become technology-neutral contract tests; production/implementation execution remains unauthorized. | §12 |
| P-40 | §11.1 migration | DEFER | Physical fields, backfill, and absent/null behavior require an authorized implementation schema review. | D-5 |
| P-41 | §11.2 specific handler/class | REJECT | A named Python file/class is an implementation assumption outside contract recovery. | §11 |
| P-42 | §11.3 projection implementation | REJECT | A named service, IAM role, and field read path are premature; only resolver behavior is contractual. | §§8, 10.1 |
| P-43 | §11.4 M3 entry state | ADOPT WITH MODIFICATION | Logical no-route/existing-route states matter, but formal implementation cannot begin before M2 closes. | §§5, 12.6 |
| P-44 | Part 12 dependency chain | ADOPT WITH MODIFICATION | M1 authority and M3→M4→M6 order remain; M2 is OPEN/BLOCKED and Slice I is not reopened. | §§1.3–1.4, 12.6 |
| P-45 | R-1 cross-IX-ID mutation | ADOPT | Server-resolved ownership and non-enumerating denial defeat the attack. | §§6.1, 6.3 |
| P-46 | R-2 client sets ACTIVE | ADOPT | M3 has no activation authority or input field. | §§5.1–5.2, 12.5 |
| P-47 | R-3 forged activation token | ADOPT WITH MODIFICATION | Current authentication is necessary but never sufficient for M4 proof; M4 authority remains separate. | §§6.1, 5.5 |
| P-48 | R-4 pending public exposure | ADOPT | Full resolver eligibility and direct-client denial prevent pending-address disclosure. | §§8.1–8.2, 10.1 |
| P-49 | R-5 concurrent replacement | ADOPT WITH MODIFICATION | Global revision CAS plus head/status binding, not a Firestore-specific contention claim, guarantees one winner. | §7.3 |
| P-50 | R-6 cross-IX-ID operation replay | ADOPT WITH MODIFICATION | Receipt binding includes canonical IX ID, account, principal, revisions, and framed payload. | §§4.4, 7.4 |

### 14.3 Disposition totals

| Disposition | Count |
|---|---:|
| ADOPT | 8 |
| ADOPT WITH MODIFICATION | 35 |
| REJECT | 3 |
| DEFER | 4 |
| **Total** | **50** |

---

## 15. Candidate status and stop boundary

This recovery candidate is ready only for the lane-required independent
contract/security/scope POST-WORK review. It is not staged, committed, frozen, or
authorized for implementation.

M2 remains OPEN/BLOCKED. Formal M3 implementation remains unavailable until M2
satisfies its existing closure requirements and a separate valid implementation lane
exists.
