# ImplicitEx Architectural Principles

## Status

Normative product constitution.

## Scope

This document governs what ImplicitEx is permitted to become.

All subordinate specifications, trust models, protocol documents, implementations, interfaces, communications, and operational procedures inherit authority from this document.

Nothing below this document may contradict it.

Authority chain:

```text
IMPLICITEX_ARCHITECTURAL_PRINCIPLES.md
        -> trust models
        -> protocol specifications
        -> product specifications
        -> backend implementations
        -> frontend implementations
        -> presentation layers
```

This document is not a description of the current implementation. It is a set of constraints on future implementation.

## Epistemic Foundation

States are established by evidence, not by assertion.

ImplicitEx does not treat intention, presentation, confidence, convenience, or successful submission as proof that a state transition is complete.

## Thesis

ImplicitEx optimizes for informed commitment through earned confidence.

Trust architecture:

| Role | Definition |
| --- | --- |
| User Outcome | Informed Commitment |
| Mechanism | Earned Confidence |
| Means | Evidence |
| Process | Verification |
| Safeguard | Explicit Uncertainty |

ImplicitEx does not optimize for frictionless completion when completion reduces user understanding.

Reducing friction is desirable only when doing so preserves or improves the user's ability to understand the action, evidence, uncertainty, expected outcome, and verification path.

## Foundational Statement

We do not declare a state transition complete because we intend it to be complete. We declare it complete because we have sufficient evidence that it is complete.

This rule governs:

- product state
- transfer state
- chain state
- registry state
- revocation state
- receipt state
- deployment state
- documentation state
- operational state
- engineering state

## Validity Test

A principle is valid only if it can prevent the implementation of a desirable feature.

A principle that cannot say no has no governing authority.

## Principle 0: Informed Commitment

ImplicitEx optimizes for informed commitment rather than frictionless completion.

Users should understand:

- what action they are taking
- what evidence supports that action
- what uncertainty remains
- what outcome is expected
- how the outcome can be independently verified afterward

Operational rule:

Reducing clicks, suppressing detail, hiding warnings, or accelerating completion is permitted only when it does not reduce user understanding.

Rejected proposal:

| Proposal | Rejected Because |
| --- | --- |
| Auto-execute transfers after wallet approval to reduce clicks | It improves completion while reducing informed commitment |
| Hide verification steps because they may feel slow | It prioritizes compliance over understanding |
| Remove a confirmation surface because it hurts conversion | It treats completion as the goal |

## Principle 1: Evidence Over Assertion

Every user action should produce evidence proportional to the amount of trust being requested from the user.

Operational rule:

Every user input should have a corresponding evidence output.

Examples:

| User Input | Evidence Output |
| --- | --- |
| Recipient address | Identity binding, registry status, verification timestamp |
| Transfer amount | Fee computation, total debit, expected settlement |
| Wallet connection | Address, network, permissions, balances |
| Coin Card identifier | Signature verification, registry status, revocation status |
| Transfer execution | Transaction hash, event confirmation, reconciliation status |

Rejected proposal:

| Proposal | Rejected Because |
| --- | --- |
| Send button with no fee breakdown | It requests financial trust without proportional evidence |
| "Recipient verified" without verification details | It asserts correctness without showing evidence |
| "Transfer successful" without transaction evidence | It substitutes status text for proof |

## Principle 2: Trust Boundaries Must Be Explicit

ImplicitEx must clearly communicate what it verifies and what it does not verify.

ImplicitEx may verify:

- identity-to-destination binding
- cryptographic signatures
- registry status
- revocation status
- transaction execution
- blockchain settlement evidence

ImplicitEx does not verify:

- moral trustworthiness
- future behavior
- legal compliance
- business legitimacy
- investment quality
- transfer success guarantees
- recipient intent

Rejected proposal:

| Proposal | Rejected Because |
| --- | --- |
| Large `VERIFIED` badge without scope | It implies broader trust than the system verifies |
| "Safe recipient" label | It suggests moral or legal trustworthiness |
| "Guaranteed transfer" language | It implies future execution certainty the system cannot provide |

## Principle 3: Verify Internally, Demonstrate Externally

Every critical operation should be validated before execution, observed during execution, reconciled after execution, and archived for future inspection.

Lifecycle:

```text
validate
    -> execute
    -> observe
    -> reconcile
    -> archive
```

This principle applies to user-facing operations and internal engineering process.

Examples:

- transfer approval validation
- event reconciliation
- interrupted-transfer repair
- observability testing
- state convergence
- Coin Card variable parity
- deployment evidence
- smoke test artifacts

Rejected proposal:

| Proposal | Rejected Because |
| --- | --- |
| Mark transfer complete immediately after submission | It skips observation and reconciliation |
| Close a deployment gate after deploy output only | It lacks post-deploy smoke evidence |
| Generate a receipt before event reconciliation | It archives an unproven state |

## Principle 4: Presentation Is Not Proof

Visual presentation may communicate evidence, but it is never itself evidence.

Therefore:

- interfaces are not trust anchors
- branding is not verification
- styling is not authenticity
- screenshots are not proof
- Coin Card presentation is never signed
- only canonical payloads, signatures, registry state, and observed events constitute evidence

Rejected proposal:

| Proposal | Rejected Because |
| --- | --- |
| Treat Coin Card styling as authenticity | It substitutes presentation for proof |
| Sign the rendered visual card | It signs presentation instead of canonical payment identity |
| Use professional visual polish as a trust claim | It asks users to infer evidence from aesthetics |

## Principle 5: Uncertainty Should Be Exposed, Not Hidden

Uncertainty is part of the evidence model.

If ImplicitEx does not know something, cannot verify something, or cannot guarantee something, the system should expose that uncertainty rather than obscure it.

Examples:

- Recipient identity verified; business legitimacy not verified.
- Transaction submitted; final settlement pending.
- Registry reachable; revocation status stale by 4 minutes.
- Prediction confidence: moderate.
- Transfer observed; reconciliation still in progress.

Rejected proposal:

| Proposal | Rejected Because |
| --- | --- |
| Hide stale registry status because it may worry users | It suppresses uncertainty |
| Replace "reconciliation pending" with "success" | It asserts completion before evidence exists |
| Remove confidence language from predictions | It hides the limits of system knowledge |

## Rejection Tests

These tests are examples of the constitution exercising authority.

| Proposal | Rejected Because |
| --- | --- |
| Hide fee calculations behind an expandable disclosure by default | Violates Principle 1 |
| Use `VERIFIED` without explaining what was verified | Violates Principle 2 |
| Mark a transfer complete before reconciliation | Violates Principle 3 |
| Treat Coin Card visual design as authenticity | Violates Principle 4 |
| Hide stale registry state | Violates Principle 5 |
| Optimize clicks at the expense of understanding | Violates Principle 0 |

## Domain Implications

### Transfers

- Fees must be explained before commitment.
- State transitions must be observable.
- Reconciliation must be surfaced.
- Failures must be explicit.
- Transaction evidence must be independently inspectable when possible.

### Coin Card

- A Coin Card is a verifiable payment identity credential.
- Presentation is not proof.
- Identity-to-destination binding must be verifiable.
- Revocation must be observable.
- Trust claims must be bounded.
- The visual card is never the signed object.

### Receipts

- Receipts are evidence artifacts.
- Receipts must distinguish observed data from inferred data.
- Receipts must preserve uncertainty state when uncertainty exists.
- Receipts should include provenance, timestamps, and verification state.

### Legal Language

- Public claims must correspond to actual verification performed.
- Guarantees must not be implied by aesthetics.
- Custody, verification, risk, settlement, and third-party dependency boundaries must be explicit.
- Legal summaries must not broaden the claims made by controlling terms.

### APIs

- APIs should expose evidence and uncertainty, not merely outcomes.
- Confidence, provenance, timestamps, verification state, and revocation state should be first-class fields.
- API consumers should be able to distinguish submitted, observed, reconciled, archived, active, stale, revoked, and unknown states.

### Internal Engineering Practice

- Gates close by evidence.
- Deployments require observation after release.
- Documentation state should not be declared final before the governing evidence exists.
- A test result, smoke report, commit hash, transaction hash, registry state, or archived artifact is stronger than intention.

## Closing Rule

When a future feature, interface, or process creates pressure to trade user understanding for completion, the constitutional question is:

Does this make the user more informed, or merely more compliant?

If it makes the user merely more compliant, it is not authorized by this document.
