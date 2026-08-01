# Coin Card Trust Model

## Status

Normative subordinate trust model.

**V1 trust model frozen: 2026-07-04.**

V1 implementation may refine field names, validation mechanics, UI layout, and
receipt rendering, but it must not reopen or weaken these boundaries:

- Free Coin Card verifies the route, not recipient identity.
- Registered/Paid Coin Card may add recipient, domain, wallet-control, registry,
  signature, and revocation evidence.
- Purpose labels are metadata, not settlement logic.
- Current manifests cannot rewrite transaction-time evidence.
- Blockchain evidence controls settlement truth.

Changes to these boundaries require an explicit V2 trust-model review, not an
implementation convenience change.

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

Coin Card is a family of embeddable payment objects for non-custodial value
transfer. The trust claim depends on the tier and evidence available.

At the free self-hosted tier, a Coin Card is a payment route interface. It
loads host-controlled payment instructions, validates the route, and helps a
sender execute a transfer through the official ImplicitEx rail.

A free Coin Card is permitted to make this claim:

```text
This is a supported payment route using an official ImplicitEx transfer rail.
The displayed recipient address is the address supplied by the host-controlled
manifest at the time of transaction.
```

A verified or registered Coin Card is a verifiable payment identity credential
that binds a public recipient identity to a specific non-custodial payment
destination, with registry-backed status and revocation.

A verified or registered Coin Card is permitted to make this claim:

```text
This public recipient identity is bound to this specific payment destination,
under this registry status, according to the currently available verification evidence.
```

A free Coin Card exists to answer:

- is this embed using the official ImplicitEx transfer rail
- is the recipient address syntactically valid
- which network and token route is being requested
- what address was loaded from the manifest at the time of transaction
- whether the completed transaction is verifiable on-chain

A verified or registered Coin Card exists to answer:

- who the recipient identity claims to be
- where payment is intended to go
- whether that identity-to-destination binding has supporting evidence
- whether the registry status currently permits use
- whether any known revocation or invalidation state applies

A Coin Card does not execute a transfer. It informs commitment before transfer execution.

## 1.1 Free Tier Boundary

Free Coin Card verification is route verification, not recipient verification.

ImplicitEx may verify:

- official ImplicitEx contract or transfer surface
- supported network
- supported token
- syntactically valid recipient address
- fee calculation and transfer amount
- transaction hash and on-chain settlement
- manifest hash or equivalent fingerprint at transaction time, when available

ImplicitEx does not verify at the free tier:

- the recipient's legal identity
- whether the recipient address belongs to the host website
- whether the host entered the intended address
- whether the host later changed its own manifest
- whether the host is honest, compliant, reputable, or safe

Required free-tier meaning:

```text
The host supplies the recipient address. ImplicitEx validates the route and
records what was used. The sender decides whether to pay that address.
```

If a host changes its self-hosted manifest after a transaction, the historical
transaction remains anchored by the on-chain transaction hash and the recorded
manifest fingerprint where available. The current manifest is not proof of what
the card displayed in the past.

## 1.2 Paid Verification Boundary

Recipient, domain, wallet-control, registry, or business-level verification
belongs in a separate verified or registered program.

Allowed paid verification evidence may include:

- wallet-control signature
- verified domain association
- signed manifest
- registry publication
- revocation status
- evidence timestamp
- support or business metadata, when explicitly collected

Wallet signature verification is preferred over micro-transfer verification when
possible because it proves control of the recipient address without moving funds.
Micro-transfer verification may be used later if a specific product need
justifies the added friction and gas cost.

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

A free Coin Card must not be described as proving that:

- the host owns the displayed wallet
- the displayed wallet belongs to a named person or business
- the recipient identity is verified
- ImplicitEx stands behind the recipient

No Coin Card must be described as proving that:

- the recipient is honest
- the recipient is legally compliant
- the recipient will behave correctly in the future
- a transfer will succeed
- funds can be recovered after transfer
- ImplicitEx controls, holds, redeems, or insures the funds

## 3. What Evidence Constitutes a Valid Coin Card?

Free-tier validity requires route evidence, not identity evidence.

Required free-tier evidence:

- host manifest or host-supplied configuration
- valid recipient address format
- supported network and token route
- official ImplicitEx contract or execution surface
- fee and amount calculation
- transaction hash after execution
- manifest hash or equivalent fingerprint at transaction time, when available

A valid free Coin Card may be operationally valid without proving identity.

Verified or registered Coin Cards require evidence sufficient to support the
identity-to-destination binding and current registry state.

Required verified-tier evidence:

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

Allowed free-tier language:

- official ImplicitEx route
- supported payment route
- recipient address supplied by host
- address format valid
- network supported
- token supported
- contract verified
- manifest fingerprint recorded
- transaction confirmed on-chain
- recipient receives the displayed amount

Allowed free-tier explanatory language:

```text
This Coin Card uses an official ImplicitEx transfer route.
```

```text
The recipient address is supplied by the host manifest.
```

```text
ImplicitEx does not verify the recipient identity for free self-hosted Coin Cards.
```

```text
Payment was sent to the wallet address loaded from this Coin Card manifest at
the time of transaction.
```

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

- verified recipient, unless enrolled in an explicit verified-recipient program
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
