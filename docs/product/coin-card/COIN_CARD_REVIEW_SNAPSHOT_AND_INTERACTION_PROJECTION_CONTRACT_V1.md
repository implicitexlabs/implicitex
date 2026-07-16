# Coin Card Review Snapshot and Interaction Projection Contract v1

Status: proposed runtime contract

## Purpose and Authority

CONSTITUTIONALLY REQUIRED: Coin Card must help a payer decide whether to move
money with informed confidence. The system's knowledge exists to support the
user's decision, not replace it.

ARCHITECTURAL REQUIREMENT: The Coin Card interaction architecture requires a
durable boundary between configuring a payment, reviewing it, authorizing it,
executing it, and settling it.

CONTRACT DECISION: This contract defines the narrow runtime layer that freezes,
binds, invalidates, and projects review state. It does not perform manifest
verification, lifecycle promotion, execution authorization, wallet access,
transaction submission, or settlement reconciliation.

EXISTING: Hardened trust and execution contracts remain authoritative:

- promoted presentation authority is produced and branded by the lifecycle
  presentation module
- execution authorization is produced and branded by the execution authorization
  module
- one-shot proof consumption, replay rejection, provider continuity, and TOCTOU
  checks remain in IX_EXECUTION

The review contract may bind evidence. It must never manufacture authority.

## Current Correction Boundary

CONTRACT DECISION: A branded ReviewRecord is not, by itself, sufficient to
authorize. Authorization input construction requires a branded
ReviewEligibilityEvaluation produced by this contract for the exact ReviewRecord
and explicit current evidence. Omitted current evidence never implies current
eligibility.

CONTRACT DECISION: Trusted dependencies are bound once per review-projection
runtime instance:

```javascript
createReviewProjectionRuntime({
  presentationApi,
  lifecycleResolutionApi,
  authorizationApi
})
```

Individual operations must not accept replacement security predicates. The
runtime uses the bound `isPromotedPresentationResult`,
`isResolvedLifecycleResult`, and `isExecutionAuthorizedResult` predicates
internally. ReviewRecords, eligibility evaluations, authorization-input bundles,
and execution-attempt bindings are branded by the configured runtime instance;
shape-alike values or values from another instance are not accepted.

## Non-Goals

This contract does not define visual layout, copy treatment, animation, card
geometry, QR behavior, wallet connection UI, blockchain calls, or fee policy.

This contract does not replace the existing non-forgeable predicates for:

- promoted presentation results
- execution-authorized results

A fingerprint in this contract is a deterministic equality and binding aid. It
is not authorization, security authority, or proof of provenance.

## Data Schemas

### DraftTransferIntent

CONTRACT DECISION: Draft intent is revision-based. "Mutable" means the payer may
edit by creating a new immutable revision. Draft objects are never mutated in
place.

Required fields:

- `schemaVersion`
- `draftId`
- `revision`
- `cardId`
- `manifestId`
- `recipientAddress`
- `tokenAddress`
- `executionContractAddress`
- `requiredChainId`
- `recipientAmountAtomic`
- `platformFeeAtomic`
- `totalDebitAtomic`
- `draftFingerprint`

Rules:

- monetary values are canonical base-10 atomic-unit strings
- JavaScript numbers are not accepted for monetary values
- negative, malformed, fractional, or unsafe monetary values are rejected
- `recipientAmountAtomic + platformFeeAtomic === totalDebitAtomic`
- draft intent is non-authorizing and cannot initiate wallet writes

### ReviewedPaymentTerms

ARCHITECTURAL REQUIREMENT: Reviewed terms are the exact recipient-side payment
terms shown to the payer during review.

Required fields:

- `schemaVersion`
- `reviewId`
- `createdAt`
- `sourceDraftId`
- `sourceDraftRevision`
- `cardId`
- `manifestId`
- `promotedAuthorityDescriptor`
- `lifecycleReference`
- `recipientAddress`
- `tokenAddress`
- `executionContractAddress`
- `requiredChainId`
- `recipientAmountAtomic`
- `platformFeeAtomic`
- `totalDebitAtomic`
- `reviewedTermsFingerprint`

The fingerprint includes only plain deterministic data. It never serializes the
opaque branded promoted-presentation object.

### ReviewWalletSnapshot

ARCHITECTURAL REQUIREMENT: Wallet evidence is attached to review, but it is not
a reviewed recipient term.

Required fields:

- `schemaVersion`
- `senderAddress`
- `observedChainId`
- `tokenBalanceAtomic`
- `nativeGasBalanceAtomic` or `gasReadiness`
- `allowanceAtomic`
- `providerReference`
- `accountGeneration`
- `chainGeneration`
- `providerGeneration`
- `createdAt`
- `walletSnapshotFingerprint`

This snapshot is the immutable authorization-time wallet evidence for one
attempt. It is not silently rewritten after authorization. Later execution
observations are recorded separately.

### ReviewRecord

CONTRACT DECISION: Review is represented by a non-forgeable ReviewRecord that
contains:

- frozen `reviewedPaymentTerms`
- frozen `walletSnapshot`
- the actual opaque branded promoted-presentation result
- creation metadata
- deterministic `reviewBindingFingerprint`
- optional explicit invalidation metadata

ReviewRecord identity is protected by a private brand. A structurally similar
plain object is not a valid ReviewRecord.

## Branding and Authority Preservation

CONTRACT DECISION: `createReviewRecord()` requires a caller-supplied predicate
for promoted authority, such as the existing
`isPromotedPresentationResult(value)`. The predicate remains authoritative.

The module stores the opaque promoted result as an opaque runtime reference. It
also stores a plain authority descriptor for fingerprinting, display, and
diagnostics. These are not interchangeable:

- the opaque promoted result may contribute to existing authorization
- the plain descriptor may contribute to deterministic fingerprints
- the fingerprint may not satisfy promoted-authority predicates

CONTRACT DECISION: The authority descriptor and promoted presentation object are
derived procedurally from one exact branded resolved lifecycle source. The review
runtime calls the canonical lifecycle-presentation API:

```javascript
presentationApi.promotePresentation(resolvedLifecycleResult)
```

on the supplied branded resolved lifecycle result. The promoted result stored in
the ReviewRecord is the result returned from that call. Independently supplied
promoted results are not accepted as source-binding evidence and cannot be paired
with a different resolved lifecycle result.

The descriptor binds, where exposed by the existing lifecycle result:

- promotion outcome
- resolved lifecycle fact and outcome
- card ID
- requested and resolved manifest ID
- resolved revision
- resolved record ID
- registry ID and version
- card and manifest status

Review creation fails if the lifecycle source is not active/current, if the
draft card or manifest differs from the lifecycle source, or if the lifecycle
reference contradicts that source. Two independently branded active lifecycle
results with identical generic facts cannot be interchanged because the review
runtime promotes the exact resolved object it receives and derives identity from
that same object.

PROPOSED RUNTIME MIGRATION: Authorization input construction should use the
branded ReviewRecord to provide the original promoted result, a frozen transfer
intent compatible with the execution-authorization contract, and a frozen wallet
snapshot compatible with the same contract.

## Canonicalization and Fingerprints

CONTRACT DECISION: v1 uses deterministic type-tagged, length-prefixed canonical
strings rather than cryptographic hashes. The format is intentionally plain
because fingerprints are not security authority.

Each fingerprint begins with a distinct domain:

- `IX_COIN_CARD_DRAFT_V1`
- `IX_COIN_CARD_REVIEWED_TERMS_V1`
- `IX_COIN_CARD_WALLET_SNAPSHOT_V1`
- `IX_COIN_CARD_REVIEW_BINDING_V1`
- `IX_COIN_CARD_EXECUTION_ATTEMPT_V1`

Fields are ordered by schema, not object enumeration. Atomic-unit values are
canonical base-10 strings. Address values are lowercased for comparison and
fingerprinting.

Canonicalization distinguishes strings, numbers, booleans, null, undefined,
arrays, objects, and BigInt. Plain object keys are sorted. Functions, symbols,
non-finite numbers, accessors, cyclic structures, unsupported prototypes, and
other non-data values are rejected.

## Review Creation Predicates

`createReviewRecord()` may succeed only when explicit inputs establish:

- valid normalized draft intent
- exact source draft revision
- valid branded promoted-presentation authority
- active/current lifecycle evidence
- consistent evidence resolution
- connected sender
- wallet chain matching the required chain
- sufficient token readiness
- sufficient gas readiness by supplied evidence
- provider continuity established where required
- internally consistent atomic values

Entering review freezes terms and wallet evidence. It does not authorize,
request wallet approval, submit transactions, or write to a wallet.

## Review Status Evaluation

CONTRACT DECISION: Review status is derived, not freely stored. The evaluator
returns:

- `ABSENT`: no valid branded ReviewRecord exists
- `CURRENT`: bound terms and required evidence remain eligible
- `INVALIDATED`: a bound term or required authority fact changed, or explicit
  invalidation occurred
- `STALE`: the record describes the same terms but requires renewed freshness or
  wallet evidence before authorization

An explicitly invalidated record must not become current merely because matching
values later reappear.

CONTRACT DECISION: `evaluateReviewEligibility()` produces a branded evaluation
containing:

- derived status
- reasons
- review binding fingerprint
- supplied evaluation ID
- supplied evaluation time or logical generation
- fingerprint of supplied current evidence

Authorization inputs may be built only when the evaluation is branded, bound to
the same ReviewRecord, and `CURRENT`. A structurally similar plain evaluation is
not accepted.

## Invalidation Taxonomy

### Reviewed-Term Invalidation

Requires a new review when any bound payment term changes:

- card identifier
- manifest identifier
- promoted authority descriptor
- lifecycle/currentness reference
- recipient
- token
- execution contract
- required chain
- recipient amount
- fee
- total debit
- source draft revision

### Wallet-Readiness Refresh

May preserve reviewed payment terms while blocking authorization until current
wallet evidence is acceptable:

- token balance refresh
- native gas readiness refresh
- allowance refresh
- snapshot age or generation freshness

### Authorization-Eligibility Invalidation

Blocks authorization for the current attempt:

- sender drift
- chain drift
- provider mismatch
- loss or change of promoted authority
- lifecycle block
- evidence conflict
- stale or invalid review
- wallet evidence no longer supporting safe execution

### Settlement Continuation

Once a transfer is submitted, settlement evidence dominates. Later wallet
disconnects or card-state changes must not erase submitted transaction history.

## Expected Plan-Owned Mutations

ARCHITECTURAL REQUIREMENT: TOCTOU protection must distinguish expected mutation
from external drift.

The authorization-time wallet snapshot remains immutable. Expected mutations
caused by the exact authorized execution plan may be recorded separately.

For `APPROVE_THEN_TRANSFER`, expected mutations may include:

- allowance changing from insufficient to sufficient
- gas balance decreasing because of approval gas
- gas balance decreasing because of transfer gas
- token balance decreasing by the exact authorized total debit after transfer

These effects do not alter reviewed recipient, token, network, amount, fee, or
total. Approval success does not authorize a different transfer. If continuity
or causality cannot be proven safe, the classification is fail-closed.

CONTRACT DECISION: Expected mutation classification requires a branded
ExecutionAttemptBinding and attempt-bound execution evidence. A transaction hash
string alone is not causality evidence.

The binding reconciles the branded authorization result with the exact branded
AuthorizationInputBundle:

- card ID
- manifest ID
- sender
- recipient
- token
- execution contract
- chain
- recipient amount
- fee
- total debit
- balance
- allowance
- execution plan selected by the authorization result
- provider reference from the review wallet snapshot, carried in the bundle

The binding is not a substitute for the branded authorization proof.

## Authorization Integration Boundary

The review module does not call `authorizeExecution()`.

It may construct frozen inputs for that existing module:

- the original promoted-presentation authority object
- a frozen transfer-intent snapshot
- a frozen wallet-readiness snapshot

After authorization succeeds, an execution-attempt binding may associate:

- branded ReviewRecord
- branded execution-authorization result
- exact execution plan
- provider continuity reference
- attempt ID
- review and wallet fingerprints

The binding is not an authorization proof. Consumed authorization proof remains
consumed according to existing IX_EXECUTION rules. If a real authorization
result does not expose enough information to prove an association, this contract
must fail closed rather than invent the association.

## Interaction Projection

CONTRACT DECISION: Visible states are deterministic projections from orthogonal
evidence, review, wallet, authorization, execution, and settlement inputs. They
are not new security-authority states.

`REVIEWING` and `AUTHORIZE` require the actual branded ReviewRecord and a
matching branded current ReviewEligibilityEvaluation. Caller-supplied booleans
such as `hasReviewRecord: true` or strings such as `reviewStatus: CURRENT` are
not sufficient.

Post-authorization projections require a branded ExecutionAttemptBinding:

- `EXECUTION_AUTHORIZED` without a matching attempt binding is internally
  inconsistent
- `PROOF_CONSUMED` without a matching attempt binding is internally inconsistent
- the same attempt must not expose `AUTHORIZE` again once authorization has
  begun
- token approval `CONFIRMED` is not payment success
- token approval `OUTCOME_UNKNOWN` projects outcome uncertainty
- transfer submission requires meaningful transaction evidence

Projection values:

- `PRESENTED`
- `CONFIGURING`
- `WALLET_REQUIRED`
- `WRONG_NETWORK`
- `INSUFFICIENT_FUNDS`
- `READY_FOR_REVIEW`
- `REVIEWING`
- `AUTHORIZATION_IN_PROGRESS`
- `TOKEN_APPROVAL_DECISION_PENDING`
- `TOKEN_APPROVAL_PENDING`
- `TRANSFER_DECISION_PENDING`
- `TRANSFER_SUBMISSION_PENDING`
- `CONFIRMATION_PENDING`
- `EVIDENCE_BLOCKED`
- `CANCELLED`
- `FAILED`
- `OUTCOME_UNKNOWN`
- `SUCCEEDED`
- `INTERNAL_INCONSISTENCY`

Projection precedence:

1. Confirmed, failed, submitted/pending, or outcome-unknown transaction evidence
   outranks current wallet connectivity and ordinary readiness.
2. A submitted transaction cannot project `CANCELLED`.
3. `OUTCOME_UNKNOWN` cannot project retry readiness.
4. Integrity failure, lifecycle block, promotion block, or evidence conflict
   blocks new execution.
5. Authorization or execution in progress outranks ordinary configuration
   blockers unless a hardened security contract requires immediate fail-closed
   interruption.
6. `REVIEWING` requires a current branded ReviewRecord and no later commitment
   phase.
7. `READY_FOR_REVIEW` requires valid draft and readiness evidence but no current
   review.
8. Wallet, network, and funding projections apply only when no stronger
   evidence, execution, or settlement condition exists.
9. Inspection disclosure changes presentation only; it does not mutate
   authority, intent, review, authorization, execution, or settlement state.
10. Impossible combinations project `INTERNAL_INCONSISTENCY`.

Unknown axis values and contradictory combinations project
`INTERNAL_INCONSISTENCY` with reasons rather than falling into ordinary
configuration.

## Legal and Prohibited Actions

The action evaluator derives allowed and prohibited actions from projection.

Global constraints:

- no authorization from `PRESENTED` or `CONFIGURING`
- no execution from `READY_FOR_REVIEW`
- no edit beneath active authorization or execution
- no ordinary cancel after broadcast
- no retry from unknown settlement without reconciliation
- no host-supplied recipient substitution
- compact presentation cannot expand the legal action set

Compact presentation is not security authority. A compact surface may withhold
review and authorization actions, but it must preserve an explicit
`EXPAND_PRESENTATION` path into the full Coin Card journey.

## Complete Wallet Observation

CONTRACT DECISION: Current eligibility requires a complete current wallet
observation. At minimum it includes:

- sender address
- observed chain ID
- token balance atomic
- allowance atomic
- explicit gas readiness
- native gas balance when the review snapshot used one
- provider reference
- account generation
- chain generation
- provider generation
- observation time or logical generation

The v1 rule is strict: the authorization-current wallet observation must match
the bound review wallet snapshot for every authorization-relevant field. If the
wallet facts changed, the reviewed payment terms may remain meaningful, but
eligibility is `STALE` and authorization inputs cannot be built until a refreshed
review/wallet binding exists.

## Authorization-Input Bundle

CONTRACT DECISION: `buildAuthorizationInputs()` returns a private-branded,
immutable AuthorizationInputBundle. It is bound to:

- exact ReviewRecord
- exact ReviewEligibilityEvaluation
- review binding fingerprint
- eligibility fingerprint
- promoted-presentation object
- frozen transfer intent
- frozen wallet snapshot
- provider reference
- complete review wallet evidence for later comparison

A copied bundle is not accepted. `bindExecutionAttempt()` requires this exact
branded bundle and reconciles the genuine branded authorization result against
the bundle. The provider continuity identity is derived from the bundle; any
observed provider reference supplied to bind an attempt must equal the bundle's
provider reference. The bundle is not an authorization proof.

## Plan-Owned Mutation Limitation

PROPOSED RUNTIME MIGRATION: Positive plan-owned mutation classification is
deferred until IX_EXECUTION exposes trusted execution evidence. In this contract
version:

- loose transaction hashes fail closed
- detailed caller-created approval objects fail closed
- detailed caller-created transfer objects fail closed
- `EXPECTED_PLAN_MUTATION` is reserved for a future trusted evidence type

The classifier compares complete before/after wallet evidence, including sender,
chain, token balance, allowance, gas readiness, native gas balance, provider,
and account/chain/provider generations. Identical complete observations return
`NO_CHANGE`; sender, chain, provider, or generation drift returns
`UNEXPECTED_EXTERNAL_DRIFT`; insufficient token or gas readiness returns
`READINESS_REFRESH_REQUIRED`; other changed wallet facts return
`UNSAFE_OR_UNPROVABLE`.

The classifier may return `NO_CHANGE`, `READINESS_REFRESH_REQUIRED`,
`UNEXPECTED_EXTERNAL_DRIFT`, or `UNSAFE_OR_UNPROVABLE`. `EXPECTED_PLAN_MUTATION`
is reserved for future trusted IX_EXECUTION evidence. It must not turn
caller-provided transaction descriptions into proof of causality.

## Execution-Plan Projection Binding

CONTRACT DECISION: Post-authorization projection derives the execution plan from
the branded ExecutionAttemptBinding. If an `executionPlan` input is supplied
alongside an attempt binding, it must match the binding. Token-approval phases
are legal only for `APPROVE_THEN_TRANSFER`, require a branded attempt binding,
and require meaningful approval evidence for submitted, confirmed, or unknown
approval outcomes.

Transfer wallet-decision and submission phases require a branded attempt
binding. Transfer submitted and settlement success require meaningful transfer
transaction evidence. Post-authorization phases must not expose `AUTHORIZE`
again for the same attempt.

## Legal and Illegal Transition Table

| Transition | Contract status |
| --- | --- |
| draft intent -> review | legal when review predicates pass |
| review -> edit draft | legal before authorization/execution |
| review -> authorization | legal only from current branded review |
| authorization blocked -> review/recovery | legal by existing outcome |
| authorization authorized -> wallet decision | legal through existing execution path |
| token approval required -> token wallet decision | legal when exact plan requires it |
| token approval confirmed -> exact bound transfer decision | legal only for same attempt and plan |
| transfer submitted -> confirmation pending | legal |
| confirmation pending -> succeeded/failed/outcome unknown | legal |
| pre-broadcast stage -> cancelled | legal |
| post-broadcast stage -> ordinary cancelled | illegal |
| configuring -> transfer submitted | illegal |
| presented -> authorization | illegal |
| review creation -> automatic execution | illegal |
| token approval confirmed -> succeeded payment | illegal |
| outcome unknown -> retry without reconciliation | illegal |
| stale review -> authorization | illegal |
| provider mismatch -> execution continuation | illegal |
| host-supplied recipient mutation beneath current review | illegal |

## Runtime Migration Notes

PROPOSED RUNTIME MIGRATION: `card.js` should migrate from immediate
`READY_TO_SEND -> startExecution()` dispatch to:

1. draft intent revision
2. review record creation
3. visible review
4. separate authorization action
5. existing authorization and execution flow

DEFERRED: visual hierarchy, copy, responsive layout, QR amount-prefill behavior,
management UI, and exact receipt presentation are downstream of this contract.

## Test Matrix

Focused tests for this contract must cover:

- deterministic construction and deep freezing
- immutable draft revisions
- atomic-unit rejection and total invariant
- branded ReviewRecord predicate and forged-shape rejection
- branded ReviewEligibilityEvaluation predicate and forged-shape rejection
- unbranded promoted authority rejection
- promoted authority descriptor derived from real lifecycle source
- review creation does not authorize or write
- stale and invalidated review behavior
- review alone cannot build authorization inputs
- reviewed-term invalidation
- wallet refresh versus invalidation
- expected plan-owned mutation classification
- projection precedence and action restrictions
- proof/retry boundary adapters without replacing existing authority
