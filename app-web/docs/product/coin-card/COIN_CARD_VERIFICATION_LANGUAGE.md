# Coin Card Verification Language

## Status

Normative subordinate language model.

## Authority

This document inherits authority from:

```text
../IMPLICITEX_ARCHITECTURAL_PRINCIPLES.md
COIN_CARD_TRUST_MODEL.md
MANIFEST_SCHEMA.md
REGISTRY_MODEL.md
REVOCATION_MODEL.md
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

Nothing in this language model may broaden the trust claims authorized by the Coin Card Trust Model.

## Scope

This document defines permitted and forbidden verification claims across human-facing and API-facing surfaces.

It governs:

- badges
- labels
- status text
- API-facing status fields
- receipt language
- stale, unknown, and pending language
- legal and marketing boundaries
- copy patterns for verified, paused, revoked, stale, and unknown states

## Non-Scope

This document does not define:

- publisher workflow
- registry mechanics
- revocation mechanics
- manifest fields
- canonicalization
- UI layout
- card styling
- transfer execution
- receipt storage
- legal terms

## Controlling Rule

Verification language must describe evidence, not imply trust beyond evidence.

A Coin Card verification statement may describe identity binding, destination confirmation, signature validity, registry status, revocation state, and evidence freshness.

It must not imply moral trustworthiness, business legitimacy, legal approval, custody, insurance, recoverability, or transfer success.

Free self-hosted Coin Cards are a narrower claim. Free-tier language may verify
the route, address format, contract, network, token, manifest fingerprint, and
on-chain transaction evidence. It must not claim recipient identity, domain, or
business verification unless the Coin Card is enrolled in a separate verified or
registered program.

## Permitted Claims

Permitted free-tier claims:

- official ImplicitEx route
- contract verified
- supported network
- supported token
- address format valid
- recipient address supplied by host
- manifest fingerprint recorded
- payment route verified
- transaction confirmed on-chain
- recipient receives displayed amount

Permitted verification claims:

- verified payment identity
- identity binding verified
- destination confirmed
- payment destination verified
- signature valid
- registry active
- registry status active
- registry status: ACTIVE
- revocation status clear
- evidence current as of timestamp
- manifest hash matched
- registry record found
- registry signature valid

Permitted explanatory patterns:

```text
This Coin Card binds the displayed recipient identity to the displayed payment destination.
```

```text
The canonical payment identity payload signature is valid.
```

```text
The registry currently reports this Coin Card as ACTIVE.
```

```text
Revocation status: clear.
```

```text
Evidence checked at 2026-06-28T00:00:00Z.
```

## Forbidden Claims

Forbidden verification claims:

- verified recipient, unless explicitly enrolled in a verified-recipient program
- trusted recipient
- safe recipient
- safe merchant
- trusted merchant
- verified business
- approved business
- legally approved
- guaranteed payment
- guaranteed transfer
- insured transfer
- recoverable funds
- fraud-proof
- fraud resistant
- risk-free
- officially endorsed
- impossible to intercept
- unhackable
- compliant recipient
- legitimate business

Forbidden explanatory patterns:

```text
This recipient is safe.
```

```text
This business has been verified.
```

```text
Payment is guaranteed.
```

```text
Funds are protected.
```

```text
ImplicitEx approves this merchant.
```

## Badge Language

Badges must name the evidence they represent.

Allowed badges:

```text
OFFICIAL IMPLICITEX ROUTE
CONTRACT VERIFIED
SUPPORTED NETWORK
SUPPORTED TOKEN
ADDRESS FORMAT VALID
MANIFEST FINGERPRINT RECORDED
VERIFIED PAYMENT IDENTITY
REGISTRY ACTIVE
DESTINATION CONFIRMED
SIGNATURE VALID
REVOCATION CLEAR
EVIDENCE CURRENT
MANIFEST HASH MATCHED
REGISTRY SIGNATURE VALID
```

Conditionally allowed badges:

```text
VERIFIED
```

`VERIFIED` is permitted only when adjacent text explains what was verified.

Required adjacent explanation example:

```text
Verified payment identity: signature valid, registry ACTIVE, destination confirmed.
```

Forbidden badges:

```text
TRUSTED
SAFE
GUARANTEED
VERIFIED RECIPIENT
APPROVED BUSINESS
VERIFIED BUSINESS
INSURED
FRAUD-PROOF
RISK-FREE
LEGALLY APPROVED
```

## Labels

Allowed labels:

- Payment identity
- Recipient identity
- Payment destination
- Registry status
- Revocation status
- Signature status
- Evidence freshness
- Manifest hash
- Registry signature
- Last checked
- Verification timestamp

Forbidden labels:

- Trust score
- Safety score
- Verified recipient
- Approved merchant
- Business verification
- Fraud protection
- Insurance status
- Legal status
- Guaranteed status

## Status Text by State

### ACTIVE

Permitted:

```text
Registry status: ACTIVE.
```

```text
Verified payment identity. Destination confirmed. Revocation status clear.
```

```text
Evidence current as of 2026-06-28T00:00:00Z.
```

Not permitted:

```text
Trusted recipient.
```

```text
Safe to pay.
```

```text
Payment guaranteed.
```

### PAUSED

Permitted:

```text
Registry status: PAUSED.
```

```text
This Coin Card is temporarily not available for active use.
```

```text
Payment identity evidence exists, but current operational use is paused.
```

Not permitted:

```text
Recipient is unsafe.
```

```text
This was revoked.
```

### REVOKED

Permitted:

```text
Registry status: REVOKED.
```

```text
This Coin Card is no longer operationally valid.
```

```text
Historical record remains available; active use is blocked.
```

Not permitted:

```text
Fraud detected.
```

```text
Recipient is dishonest.
```

```text
Business is illegal.
```

### SUPERSEDED

Permitted:

```text
Registry status: SUPERSEDED.
```

```text
This Coin Card has been replaced by a newer credential.
```

```text
Use the superseding Coin Card when available.
```

Not permitted:

```text
Original recipient is unsafe.
```

```text
Previous card was fraudulent.
```

### EXPIRED

Permitted:

```text
Registry status: EXPIRED.
```

```text
This Coin Card is no longer current because its validity window elapsed.
```

Not permitted:

```text
Recipient failed verification.
```

### UNKNOWN

Permitted:

```text
Registry status: UNKNOWN.
```

```text
Current operational validity cannot be established.
```

```text
Do not treat this Coin Card as active until current evidence is available.
```

Not permitted:

```text
Probably active.
```

```text
Safe by default.
```

### STALE

Permitted:

```text
Evidence stale.
```

```text
Registry record found, but status evidence is stale.
```

```text
Last checked at 2026-06-28T00:00:00Z.
```

Not permitted:

```text
Still verified.
```

```text
Still safe.
```

### PENDING

Permitted:

```text
Verification pending.
```

```text
Signature validation pending.
```

```text
Registry lookup pending.
```

Not permitted:

```text
Verified soon.
```

```text
Expected to pass.
```

## API Language

API fields must expose evidence state and uncertainty rather than compressing verification into a single true/false value.

Allowed API field names:

```text
identity_binding_status
destination_status
manifest_signature_status
registry_status
registry_lookup_state
revocation_status
evidence_freshness
last_checked_at
payload_hash
manifest_hash_match
registry_signature_status
revocation_signature_status
verification_state
uncertainty_reason
```

Recommended values:

```text
valid
invalid
active
paused
revoked
superseded
expired
unknown
stale
pending
unavailable
mismatch
unsupported
```

Forbidden API compression:

```json
{
  "trusted": true
}
```

```json
{
  "safe": true
}
```

```json
{
  "verified_business": true
}
```

```json
{
  "guaranteed": true
}
```

If an API provides a convenience summary, it must preserve bounded meaning.

Permitted summary:

```json
{
  "verification_state": "active",
  "summary": "Verified payment identity; registry ACTIVE; revocation clear."
}
```

## Receipt Language

Receipts may say what was observed and verified.

Receipts must preserve stale, pending, unknown, or inferred state.

Permitted receipt language:

```text
Payment was sent to the wallet address loaded from this Coin Card manifest at
the time of transaction.
```

```text
Recipient address supplied by host manifest.
```

```text
Manifest fingerprint recorded at time of transfer.
```

```text
Official ImplicitEx contract used.
```

```text
Coin Card evidence observed at 2026-06-28T00:00:00Z.
```

```text
Manifest signature valid at time of verification.
```

```text
Registry status at time of verification: ACTIVE.
```

```text
Revocation status at time of verification: clear.
```

```text
Registry evidence was stale at time of transfer.
```

Forbidden receipt language:

```text
ImplicitEx verified the recipient.
```

```text
Recipient was trusted.
```

```text
Transfer was guaranteed by Coin Card.
```

```text
Recipient business was verified.
```

```text
Funds were insured.
```

## Legal and Marketing Boundary

Public copy must not broaden the claims made by the trust model.

Permitted public copy:

```text
Registered Coin Card helps users verify a payment identity before sending.
```

```text
Free Coin Card verifies the payment route, not the recipient identity.
```

```text
The host supplies the recipient address; ImplicitEx verifies the route and records the transfer evidence.
```

```text
Registered Coin Card binds a public recipient identity to a payment destination with registry-backed status.
```

```text
Coin Card surfaces signature, registry, revocation, and freshness evidence.
```

Forbidden public copy:

```text
Coin Card verifies trusted businesses.
```

```text
Coin Card makes crypto payments safe.
```

```text
Coin Card guarantees payment delivery.
```

```text
Coin Card protects users from fraud.
```

```text
Coin Card certifies merchants.
```

## Copy Pattern

Preferred copy pattern:

```text
[Evidence name]: [observed state] [timestamp or freshness when relevant].
```

Examples:

```text
Signature status: valid.
Registry status: ACTIVE.
Revocation status: clear.
Evidence checked: 2026-06-28T00:00:00Z.
```

When uncertainty exists:

```text
[Evidence name]: [uncertain state]. [What this means for use.]
```

Example:

```text
Registry status: stale. Current operational validity cannot be established.
```

## Closing Rule

Verification language earns confidence only by naming the evidence that supports it.

Language that asks users to trust a Coin Card without naming evidence is not authorized.
