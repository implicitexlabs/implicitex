# Coin Card Verification State Copy v1

Status: copy contract proposal

Purpose: define user-facing copy for Coin Card manifest verification states
before visual treatments are implemented.

This document is subordinate to:

- `COIN_CARD_MANIFEST_RUNTIME_CONTRACT_V1.md`
- `COIN_CARD_CRYPTOGRAPHIC_INTEGRITY_ARCHITECTURE.md`
- `COIN_CARD_VERIFICATION_LANGUAGE.md`
- `COIN_CARD_TRUST_MODEL.md`

## Core Principle

Failure states should be clear, calm, and non-alarming, but they must not make
the card feel usable.

Copy must explain operational state, not accuse the recipient or imply facts not
proved by the evidence.

## Execution Rule

Only `VERIFIED` may present transfer execution as available.

All other states must make transfer execution unavailable and must not invite
the sender to continue, retry payment, connect a wallet, switch networks, or
confirm a transfer from the Coin Card.

## State Copy

| State | Status label | Primary message | Secondary message | Action copy |
| --- | --- | --- | --- | --- |
| `VERIFIED` | Verified | This Coin Card matches the issued ImplicitEx package. | The protected assets and manifest evidence are valid for this card. | Continue |
| `INTEGRITY_FAILED` | Integrity check failed | This Coin Card does not match the issued ImplicitEx package. | Protected card files changed after issuance. Transfers are disabled. | Transfers disabled |
| `CARD_REVOKED` | Revoked | This Coin Card is no longer operationally valid. | The registry marks this card as revoked. Transfers are disabled. | Transfers disabled |
| `VERIFICATION_UNAVAILABLE` | Verification unavailable | This Coin Card cannot currently be verified. | The manifest, registry, protected files, or signature evidence could not be checked. Transfers are disabled. | Transfers disabled |

## VERIFIED

Allowed copy:

```text
Verified
```

```text
This Coin Card matches the issued ImplicitEx package.
```

```text
Protected assets verified. Transfer execution is available.
```

Required behavior:

- transfer execution may be enabled
- status may use normal verified styling
- adjacent text must explain what was verified when space allows

Forbidden copy:

```text
Trusted recipient.
```

```text
Safe to pay.
```

```text
Payment guaranteed.
```

## INTEGRITY_FAILED

Allowed copy:

```text
Integrity check failed
```

```text
This Coin Card does not match the issued ImplicitEx package.
```

```text
Protected card files changed after issuance. Transfers are disabled.
```

Required behavior:

- transfer execution disabled
- wallet connection disabled
- status must not look equivalent to `VERIFIED`
- users may inspect non-transactional information if available

Forbidden copy:

```text
Fraud detected.
```

```text
Recipient is unsafe.
```

```text
Try anyway.
```

## CARD_REVOKED

Allowed copy:

```text
Revoked
```

```text
This Coin Card is no longer operationally valid.
```

```text
The registry marks this card as revoked. Transfers are disabled.
```

Required behavior:

- transfer execution disabled
- wallet connection disabled
- historical or non-transactional details may remain visible

Forbidden copy:

```text
Fraud detected.
```

```text
Recipient is dishonest.
```

```text
Payment blocked because this recipient is unsafe.
```

## VERIFICATION_UNAVAILABLE

Allowed copy:

```text
Verification unavailable
```

```text
This Coin Card cannot currently be verified.
```

```text
The manifest, registry, protected files, or signature evidence could not be checked. Transfers are disabled.
```

Required behavior:

- transfer execution disabled
- wallet connection disabled
- status must be explicit that verification did not complete
- copy must not imply success with a warning

Forbidden copy:

```text
Probably safe.
```

```text
Continue at your own risk.
```

```text
Verification skipped.
```

## Button And Action Labels

Allowed executable label for `VERIFIED`:

```text
Continue
```

```text
Send USDC
```

Allowed disabled labels for non-`VERIFIED` states:

```text
Transfers disabled
```

```text
Verification required
```

```text
Card unavailable
```

Forbidden disabled labels:

```text
Retry payment
```

```text
Connect wallet
```

```text
Proceed anyway
```

## Tone Rules

- Use operational language: verified, unavailable, revoked, disabled.
- Do not accuse the recipient.
- Do not imply fraud unless a separate evidence source explicitly proves it.
- Do not imply safety, insurance, recoverability, endorsement, or guaranteed transfer success.
- Do not present unavailable verification as a minor warning.
- Do not expose execution controls in a way that suggests the sender can bypass verification.

## Runtime Mapping

The runtime state names remain machine-readable constants:

```text
VERIFIED
INTEGRITY_FAILED
CARD_REVOKED
VERIFICATION_UNAVAILABLE
```

The UI may translate labels, but it must preserve the execution meaning:

```text
VERIFIED -> execution available
anything else -> execution disabled
```
