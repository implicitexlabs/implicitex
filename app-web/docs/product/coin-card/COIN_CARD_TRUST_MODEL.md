# Coin Card Trust Model

## Status

Normative subordinate trust model.

## Authority

This document inherits authority from:

```text
../IMPLICITEX_ARCHITECTURAL_PRINCIPLES.md
```

Authority chain:

```text
IMPLICITEX_ARCHITECTURAL_PRINCIPLES.md
        -> COIN_CARD_TRUST_MODEL.md
        -> MANIFEST_SCHEMA.md
        -> REGISTRY_MODEL.md
        -> REVOCATION_MODEL.md
        -> PUBLISHER_SPEC.md
        -> IMPLEMENTATION
```

Nothing below this document may define Coin Card behavior, language, evidence, or implementation in a way that contradicts this trust model.

## Purpose

The purpose of this document is not to define how Coin Cards are displayed, transmitted, or implemented. The purpose of this document is to define what a Coin Card is permitted to assert, what evidence must support those assertions, and what uncertainty must remain explicit.

Meaning precedes implementation:

```text
meaning
    -> evidence
    -> trust
    -> implementation
```

Implementation must not retroactively define the trust model:

```text
implementation
    -> ui
    -> marketing
    -> invented trust model
```

is not authorized.

## 1. What Is a Coin Card?

A Coin Card is a verifiable payment identity credential that binds a public recipient identity to a specific non-custodial payment destination, with registry-backed status and revocation.

A Coin Card is permitted to make this claim:

```text
This public recipient identity is bound to this specific payment destination,
under this registry status, according to the currently available verification evidence.
```

A Coin Card exists to answer:

- who the recipient identity claims to be
- where payment is intended to go
- whether that identity-to-destination binding has supporting evidence
- whether the registry status currently permits use
- whether any known revocation or invalidation state applies

A Coin Card does not execute a transfer. It informs commitment before transfer execution.

## 2. What Is Not a Coin Card?

A Coin Card is not:

- a payment guarantee
- a trustworthiness certificate
- a business license
- an escrow service
- a custodial account
- an insurance policy
- a reputation system
- a moral endorsement
- a fraud guarantee
- a legal compliance certification
- a transfer receipt
- a wallet

A Coin Card must not be described as proving that:

- the recipient is honest
- the recipient is legally compliant
- the recipient will behave correctly in the future
- a transfer will succeed
- funds can be recovered after transfer
- ImplicitEx controls, holds, redeems, or insures the funds

## 3. What Evidence Constitutes a Valid Coin Card?

A valid Coin Card requires evidence sufficient to support the identity-to-destination binding and current registry state.

Required evidence:

- canonical identity payload
- creator signature
- registry publication
- registry status
- revocation state
- verification timestamp

Evidence roles:

| Evidence | Purpose |
| --- | --- |
| Canonical identity payload | Defines the payment identity claim being evaluated |
| Creator signature | Indicates the creator-authorized payment identity payload |
| Registry publication | Establishes that the credential is publicly resolvable through the registry |
| Registry status | Indicates current operational status |
| Revocation state | Indicates whether the credential remains usable |
| Verification timestamp | Indicates when the evidence was checked |

Evidence must be displayed or made available in a way that allows users and implementers to distinguish:

- observed evidence
- inferred state
- stale state
- missing evidence
- failed verification
- unknown state

## 4. What Object Is Actually Signed?

Presentation is not proof.

The signed object is the canonical payment identity payload.

Signed:

```text
canonical payment identity payload
```

Never signed:

```text
html
css
screenshots
branding
rendered cards
iframes
animations
layout
visual themes
marketing copy
```

The visual Coin Card may communicate evidence, but the visual Coin Card is not evidence itself.

If the presentation changes while the canonical payload remains unchanged, the payment identity claim has not changed.

If the canonical payload changes while the presentation remains unchanged, the payment identity claim has changed.

## 5. What Trust Claims May Be Made?

Allowed trust language:

- verified payment identity
- destination confirmed
- registry active
- signature valid
- revocation status clear
- identity binding verified
- payment destination verified
- registry status active

Allowed explanatory language:

```text
This Coin Card binds the displayed recipient identity to the displayed payment destination.
```

```text
The registry currently reports this Coin Card as active.
```

```text
The canonical payment identity payload signature is valid.
```

Forbidden trust language:

- trusted recipient
- safe recipient
- guaranteed payment
- insured transfer
- verified business
- fraud resistant
- fraud proof
- risk free
- officially endorsed
- legally approved
- impossible to intercept
- unhackable

Any `VERIFIED` badge or equivalent trust marker must explain what was verified.

Example:

```text
Verified payment identity
Registry status: ACTIVE
Destination confirmed
Revocation status: clear
```

is permitted.

```text
Verified recipient
```

without scope is not permitted.

## 6. What Uncertainties Must Be Surfaced?

Uncertainty is part of the Coin Card evidence model.

The system must surface uncertainty when:

- registry lookup is unavailable
- revocation state is stale
- signature validation is pending
- signature validation failed
- identity evidence is incomplete
- registry publication is delayed
- verification timestamp is expired
- registry status is unknown
- credential format is unsupported
- payload canonicalization failed
- signer authority is unknown

Permitted uncertainty language:

- Registry unavailable.
- Revocation state stale.
- Signature validation pending.
- Identity evidence incomplete.
- Publication delayed.
- Verification timestamp expired.
- Registry status unknown.
- Credential format unsupported.

Uncertainty must not be converted into false confidence.

Examples:

| State | Required User Meaning |
| --- | --- |
| Registry unavailable | The Coin Card cannot currently be confirmed through the registry |
| Revocation state stale | The previous state may no longer be current |
| Signature pending | The identity payload has not yet been cryptographically confirmed |
| Identity evidence incomplete | The Coin Card claim lacks required supporting evidence |
| Verification expired | The last check is too old to support current confidence |

## 7. What Causes a Coin Card to Cease Being Valid?

A Coin Card ceases to be currently valid when evidence no longer supports active use.

Invalidating states:

```text
REVOKED
EXPIRED
SUPERSEDED
UNKNOWN
INVALID_SIGNATURE
UNPUBLISHED
UNSUPPORTED_FORMAT
MISSING_REQUIRED_EVIDENCE
REGISTRY_MISMATCH
```

State meanings:

| State | Meaning |
| --- | --- |
| REVOKED | Registry or authorized issuer has withdrawn operational validity |
| EXPIRED | Credential validity window has elapsed |
| SUPERSEDED | A newer credential replaces this one |
| UNKNOWN | Required state cannot be established |
| INVALID_SIGNATURE | Signature does not validate against the canonical payload |
| UNPUBLISHED | Credential is not resolvable through the registry |
| UNSUPPORTED_FORMAT | Credential format is not supported by the verifier |
| MISSING_REQUIRED_EVIDENCE | Required trust evidence is absent |
| REGISTRY_MISMATCH | Registry data conflicts with credential claims |

Coin Cards do not disappear as a way of resolving trust state.

Historical records should remain inspectable when possible. A revoked, expired, superseded, or invalid Coin Card may remain historically meaningful while no longer being operationally valid.

## Trust Ceremony

When a user sees a Coin Card, the user is being asked to believe only this:

```text
This recipient identity and payment destination were verified, published,
and have not been revoked according to the currently available evidence.
```

The user is not being asked to believe:

- this recipient is honest
- this transaction is guaranteed
- this transfer cannot fail
- this business is legitimate
- this destination is legally approved
- this payment is reversible

## Relationship to Future Documents

Future subordinate documents must answer implementation questions without changing this trust model.

Examples:

| Document | Permitted Scope |
| --- | --- |
| MANIFEST_SCHEMA.md | Defines the canonical payload fields and validation rules |
| REGISTRY_MODEL.md | Defines registry resolution, status lookup, and publication behavior |
| REVOCATION_MODEL.md | Defines revocation authority, state transitions, and historical handling |
| PUBLISHER_SPEC.md | Defines how a publisher creates and distributes Coin Cards |

If a subordinate document discovers a contradiction with this trust model, implementation must stop until the trust model is revised through an explicit constitutional review.

## Closing Rule

A Coin Card may earn confidence only by evidence.

It may not borrow confidence from presentation, branding, convenience, urgency, or user familiarity.
