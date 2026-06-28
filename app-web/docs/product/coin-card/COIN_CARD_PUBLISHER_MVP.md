# Coin Card Publisher MVP

## Status

Implementation planning artifact for the `coin-card-publisher-mvp` lane.

## Authority

This document inherits authority from:

```text
../IMPLICITEX_ARCHITECTURAL_PRINCIPLES.md
COIN_CARD_TRUST_MODEL.md
MANIFEST_SCHEMA.md
REGISTRY_MODEL.md
REVOCATION_MODEL.md
COIN_CARD_VERIFICATION_LANGUAGE.md
PUBLISHER_SPEC.md
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
        -> COIN_CARD_PUBLISHER_MVP.md
        -> IMPLEMENTATION
```

## Purpose

Define the smallest implementation that proves the Coin Card trust stack end to end without expanding into a broad platform build.

The MVP should answer one question:

```text
Can one nontechnical publisher create a verifiable Coin Card and publish an evidence-backed payment identity without manual shepherding?
```

It should not answer:

```text
Can ImplicitEx operate a generalized publisher platform?
```

## Scope

The MVP includes one path:

```text
Input
    -> static publisher form
    -> canonical manifest generation
    -> creator signature
    -> registry record creation
    -> verification output
    -> evidence archive
    -> published example
```

The MVP proves:

- one static publisher flow
- one canonical manifest generation path
- one signature path
- one registry record path
- one verification output
- one evidence archive
- one published example

## Non-Scope

The MVP explicitly excludes:

- generalized publisher dashboard
- account system
- arbitrary card customization
- visual theme builder
- transfer execution inside the publisher flow
- custodial balance
- business verification claims
- trust score
- marketplace or discovery system
- multi-network expansion beyond current Polygon / USDC path
- campaign system
- analytics productization
- legal or canonical route cleanup unless required by evidence
- hosted platform operations beyond the single example path

## MVP Success Criteria

The MVP succeeds when:

- a nontechnical publisher can enter required identity and destination inputs
- the system generates a canonical manifest according to `MANIFEST_SCHEMA.md`
- the publisher signs the canonical payload
- the system verifies the signature and payload hash
- the system creates a registry record according to `REGISTRY_MODEL.md`
- the system produces bounded verification language according to `COIN_CARD_VERIFICATION_LANGUAGE.md`
- the system archives publication evidence
- the published example can be independently resolved and verified

The MVP does not require:

- multiple publishers
- multiple themes
- account management
- automated production approval
- transfer execution
- monetization
- marketplace distribution

## Required Implementation Surfaces

### Static Publisher Form

The form collects only the required MVP inputs:

- public identity name
- subject type
- recipient address
- network
- asset
- issuer wallet
- reference URI
- optional expiration

The form MUST surface:

- address confirmation
- chain confirmation
- asset confirmation
- signer confirmation
- unsupported-claim warnings

The form MUST NOT present visual preview as evidence.

### Manifest Generator

The manifest generator produces:

- canonical payload
- payload hash
- unsigned manifest preview
- signature request
- signed manifest
- manifest hash
- manifest validation output

It MUST reject:

- invalid address
- unsupported network
- unsupported asset
- malformed timestamp
- missing required field
- executable content
- presentation content
- forbidden trust language
- canonicalization mismatch

### Signature Path

The MVP supports one signature path:

```text
issuer wallet signs canonical manifest payload excluding signature
```

The signing step MUST communicate:

```text
You are signing a payment identity payload, not executing a transfer.
```

The signing step MUST NOT request transfer approval, token approval, custody permissions, or payment execution.

### Registry Record Path

The MVP creates one registry record for one signed manifest.

The registry record MUST include:

- registry version
- card ID
- manifest URI
- manifest hash
- status
- published timestamp
- updated timestamp
- registry signature

For the MVP, the initial registry status is:

```text
ACTIVE
```

unless validation fails or uncertainty must be surfaced.

### Verification Output

The MVP produces one verification output containing:

- identity binding status
- destination status
- manifest signature status
- registry status
- registry lookup state
- revocation status
- evidence freshness
- payload hash
- manifest hash match
- registry signature status
- verification state
- uncertainty reason, if any

The verification output MUST NOT collapse evidence into:

```json
{
  "trusted": true
}
```

or any equivalent trust boolean.

### Evidence Archive

The MVP archives:

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

The evidence archive MUST distinguish observed evidence from inferred state.

### Published Example

The MVP includes one published example.

The example MUST be:

- publicly resolvable
- independently verifiable
- bounded by approved verification language
- archived with publication evidence

The example MUST NOT claim:

- business verification
- legal approval
- payment guarantee
- custody
- insurance
- transfer success

## MVP Flow

Required sequence:

```text
1. Enter public identity.
2. Enter recipient address.
3. Choose Polygon / USDC.
4. Review identity-to-destination binding.
5. Review trust boundaries.
6. Generate canonical manifest payload.
7. Review payload hash.
8. Sign canonical payload.
9. Verify signature.
10. Create registry record.
11. Resolve registry record.
12. Verify manifest hash match.
13. Produce verification output.
14. Archive evidence.
15. Publish example reference.
```

No step may be skipped because the visual card appears correct.

## Implementation Constraints

The MVP MUST:

- preserve the authority chain
- use only approved verification language
- surface stale, unknown, pending, failed, or mismatched evidence
- treat visual preview as non-evidence
- block publication when required evidence fails
- archive uncertainty rather than erase it
- keep transfer execution outside the publisher flow

The MVP MUST NOT:

- create a dashboard
- add account login
- add customization controls unrelated to trust evidence
- publish on unsupported networks
- claim business verification
- hide warnings to improve completion
- treat signing as publication
- treat publication as transfer readiness without registry evidence

## Local Artifact Expectations

The MVP may produce local or static artifacts before any hosted platform work:

```text
app-web/frontend/public/coincard/publisher-mvp.html
app-web/frontend/public/registry/coincards/<card_id>.json
app-web/frontend/public/registry/coincards/index.json
app-web/docs/operations/evidence/<publisher-mvp-evidence>.md
```

These paths are illustrative, not mandatory. Implementation may choose different paths if the evidence model is preserved.

## Validation Gate

The MVP is not complete until evidence shows:

- manifest generation works
- signing works
- signature verification works
- registry record creation works
- registry resolution works
- verification output is bounded
- evidence archive exists
- published example resolves
- stale or unknown states are surfaced when simulated

Completion requires archived evidence.

## Closing Rule

The MVP is intentionally boring.

It proves the trust stack once, cleanly, end to end.

It does not become the future platform until evidence supports that next state transition.
