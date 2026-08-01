# Coin Card Publisher Specification

## Status

Normative subordinate publisher process specification.

## Authority

This document inherits authority from:

```text
../IMPLICITEX_ARCHITECTURAL_PRINCIPLES.md
COIN_CARD_TRUST_MODEL.md
MANIFEST_SCHEMA.md
REGISTRY_MODEL.md
REVOCATION_MODEL.md
COIN_CARD_VERIFICATION_LANGUAGE.md
```

Authority chain:

```text
IMPLICITEX_ARCHITECTURAL_PRINCIPLES.md
        -> COIN_CARD_TRUST_MODEL.md
        -> MANIFEST_SCHEMA.md
        -> REGISTRY_MODEL.md
        -> REVOCATION_MODEL.md
        -> COIN_CARD_VERIFICATION_LANGUAGE.md
        -> PUBLISHER_SPEC.md
        -> IMPLEMENTATION
```

Nothing in this publisher specification may redefine Coin Card meaning, manifest fields, registry status semantics, revocation lifecycle, verification language, transfer execution, or presentation authority.

## Scope

This document defines the human and process layer for publishing Coin Cards.

It governs how a human or organization creates, verifies, submits, publishes, updates, supersedes, or archives a Coin Card without violating the established trust substrate.

## Non-Scope

This document does not define:

- manifest fields
- manifest canonicalization rules
- registry status semantics
- registry lookup mechanics
- revocation lifecycle
- verification language
- UI styling
- iframe behavior
- transfer execution
- custody
- legal terms

## Publishing Principle

The publisher flow must not make the user feel finished merely because a card looks good.

Publication is complete only when the manifest is signed, registry evidence is produced, verification language is bounded, and uncertainty has been surfaced.

Publishing a Coin Card means publishing evidence-backed payment identity. It does not create a payment guarantee, business endorsement, or transfer execution surface.

## Publisher Responsibilities

A publisher MUST:

- provide accurate public identity inputs
- provide the intended non-custodial payment destination
- confirm the correct network
- confirm the correct asset
- control or be authorized by the signer wallet
- review the canonical payload before signing
- review the evidence outputs before publication
- preserve the ability to pause, revoke, or supersede the Coin Card
- archive publication evidence
- avoid forbidden verification language

A publisher MUST NOT:

- publish a destination they do not control or have authority to use
- treat visual preview as verification
- treat signing as registry publication
- treat registry publication as transfer execution
- claim business verification unless separately authorized
- claim funds are guaranteed, insured, recoverable, or protected

## Required Inputs

Required publisher inputs:

| Input | Purpose |
| --- | --- |
| Public identity | Defines the subject to be bound |
| Subject type | Defines identity class under `MANIFEST_SCHEMA.md` |
| Recipient address | Defines the non-custodial payment destination |
| Network | Defines the chain for the destination |
| Asset | Defines the payment asset |
| Issuer wallet | Signs the canonical payload |
| Reference URI | Provides supporting public context without acting as trust authority |

Optional publisher inputs:

| Input | Purpose |
| --- | --- |
| Display name | Short subject label |
| Description | Plain-language identity context |
| Website | Public context |
| Avatar URI | Public visual reference, not evidence |
| Metadata URI | Extended non-executable data reference |
| Expiration | Optional intrinsic validity window |
| Supporting context | Evidence archive material |

Publisher inputs MUST remain plain data.

Publisher inputs MUST NOT include:

- HTML
- CSS
- JavaScript
- executable content
- tracking pixels
- iframe configuration
- transfer amount
- fee amount
- payment guarantee language
- business endorsement claims

## Signing Ceremony

The signing ceremony exists to bind the issuer wallet to the canonical payment identity payload.

The publisher signs:

```text
canonical manifest payload excluding signature
```

The publisher never signs:

```text
rendered card
html
css
screenshot
iframe
branding
animation
marketing copy
```

Before signing, the publisher MUST be shown or provided:

- card ID
- subject identity
- recipient address
- network
- asset
- issuer wallet
- created timestamp
- optional expiration
- payload hash

The signing ceremony MUST communicate:

```text
You are signing a payment identity payload, not executing a transfer.
```

and:

```text
This signature does not publish the Coin Card until registry evidence is produced.
```

## Manifest Generation

The manifest MUST be generated according to `MANIFEST_SCHEMA.md`.

Manifest generation MUST produce:

- canonical payload
- payload hash
- signature request
- signed manifest
- manifest hash
- manifest validation result

Manifest generation MUST reject:

- missing required inputs
- unsupported subject type
- invalid recipient address
- unsupported network
- unsupported asset
- malformed timestamps
- executable content
- presentation content
- forbidden trust language
- canonicalization mismatch

Manifest generation MUST NOT repair invalid publisher inputs into validity without publisher review.

## Pre-Publication Verification

Before registry submission, the system MUST verify:

- canonicalization succeeded
- payload hash was produced
- issuer wallet signed the canonical payload
- signature validates
- destination format is valid
- network is supported
- asset is supported
- optional expiration is valid when present
- manifest hash was produced
- forbidden content is absent
- verification language remains bounded

Pre-publication verification MUST surface:

- signature validity
- destination confirmation
- network confirmation
- asset confirmation
- payload hash
- manifest hash
- unresolved uncertainty

If pre-publication verification fails, publication MUST NOT proceed.

## Registry Submission

The publisher submits the signed manifest for registry publication.

Registry publication is governed by `REGISTRY_MODEL.md`.

Registry submission MUST produce or surface:

- card ID
- manifest URI
- manifest hash
- registry lookup state
- registry status
- published timestamp
- updated timestamp
- registry signature status

Registry submission MUST NOT be described as transfer execution.

Registry submission MUST NOT be described as legal approval, business verification, insurance, or endorsement.

## Publication Evidence

After publication, the publisher MUST receive publication evidence.

Required publication evidence:

| Evidence | Source |
| --- | --- |
| Signed manifest | Manifest generation |
| Payload hash | Canonical payload |
| Manifest hash | Signed manifest |
| Card ID | Manifest |
| Manifest URI | Registry |
| Registry lookup state | Registry lookup |
| Registry status | Registry record |
| Registry signature status | Registry validation |
| Verification state | Validator result |
| Published timestamp | Registry record |
| Updated timestamp | Registry record |
| Revocation status | Revocation model or registry-derived evidence |
| Evidence freshness | Verifier policy |

Publication is not complete until publication evidence is available or uncertainty is explicitly surfaced.

If publication evidence is stale, unavailable, unknown, or mismatched, the system MUST surface that state.

## Update and Supersession

Material changes require a new signed manifest.

Material changes include:

- recipient address change
- network change
- asset change
- subject identity change
- issuer wallet change
- card ID change
- expiration change after signing

Non-material context changes MAY be handled by metadata or registry update only when they do not alter signed meaning.

Supersession MUST follow `REVOCATION_MODEL.md`.

A superseded Coin Card MUST remain historically inspectable.

The publisher MUST be shown:

- previous card ID
- new card ID
- previous destination
- new destination
- supersession reason
- supersession timestamp
- historical preservation statement

## Revocation and Pause Path

The publisher MUST have an authorized path to request:

- pause
- unpause
- revocation
- supersession

These paths are governed by `REVOCATION_MODEL.md`.

Publisher-facing language MUST distinguish:

- pause from revocation
- revocation from deletion
- supersession from fraud
- expiration from failure
- unknown state from invalidity

Permitted publisher-facing language:

```text
Pause active use.
```

```text
Revoke operational validity.
```

```text
Supersede with a new Coin Card.
```

Forbidden publisher-facing language:

```text
Delete this Coin Card.
```

```text
Erase this record.
```

```text
Mark as fraudulent.
```

## Nontechnical Publishing Flow

A nontechnical publisher flow SHOULD follow this order:

```text
1. Enter public identity.
2. Enter recipient address.
3. Choose network and asset.
4. Review identity-to-destination binding.
5. Review unsupported claims and trust boundaries.
6. Sign the canonical manifest payload.
7. Validate the signature and payload hash.
8. Submit the signed manifest to the registry.
9. Observe registry evidence.
10. Review verification language.
11. Archive publication evidence.
12. Publish or distribute the Coin Card reference.
```

The flow MUST distinguish:

- draft
- signed
- submitted
- published
- verified
- paused
- revoked
- superseded
- unknown

The flow MUST NOT collapse these states into a single "done" state.

## Safety Checks

Required safety checks:

| Check | Required Evidence |
| --- | --- |
| Address confirmation | Recipient address displayed and validated |
| Chain confirmation | Network name and chain ID displayed |
| Asset confirmation | Asset symbol, contract, and decimals displayed |
| Signer confirmation | Issuer wallet displayed |
| Signature confirmation | Signature validity displayed |
| Payload confirmation | Payload hash displayed |
| Registry confirmation | Registry lookup state and status displayed |
| Revocation confirmation | Revocation status displayed |
| Freshness confirmation | Last checked timestamp displayed |
| Language confirmation | Forbidden claims absent |

Any failed or unknown safety check MUST be surfaced.

Unknown safety checks MUST NOT be treated as passed.

## Evidence Archive Requirements

The publisher process MUST archive:

- signed manifest
- canonical payload hash
- manifest hash
- registry record
- registry status
- registry signature status
- publication timestamps
- verification output
- revocation status at publication
- publisher confirmation
- unresolved uncertainty, if any

Archive records SHOULD distinguish:

- observed evidence
- inferred state
- stale state
- missing evidence
- failed verification
- unknown state

Archive records MUST NOT erase uncertainty.

## Closing Rule

Publishing a Coin Card means publishing evidence-backed payment identity.

It does not create a payment guarantee, business endorsement, legal approval, custody relationship, insurance policy, or transfer execution surface.
