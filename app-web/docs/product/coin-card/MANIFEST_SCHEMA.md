# Coin Card Manifest Schema

## Status

Normative subordinate schema.

## Authority

This document inherits authority from:

```text
../IMPLICITEX_ARCHITECTURAL_PRINCIPLES.md
COIN_CARD_TRUST_MODEL.md
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

Nothing in this schema may contradict the Coin Card Trust Model.

## Scope

This document defines the canonical payment identity payload signed by the creator wallet and evaluated by verifiers.

The manifest is the signed meaning layer. It is not the registry, not the card, not the publisher flow, and not the UI.

## Non-Scope

This document does not define:

- registry lookup behavior
- registry publication behavior
- revocation lifecycle
- publisher onboarding
- iframe presentation
- card styling
- frontend UX
- transfer execution
- receipt generation
- legal marketing language

## Canonical Payload

A Coin Card manifest payload defines one payment identity binding.

Required top-level shape:

```json
{
  "version": 1,
  "card_id": "coincard:creator:brandon-lehman",
  "subject": {
    "type": "person",
    "name": "Brandon Lehman"
  },
  "recipient": {
    "address": "0x0000000000000000000000000000000000000000"
  },
  "network": {
    "chain_id": 137,
    "name": "polygon"
  },
  "asset": {
    "symbol": "USDC",
    "contract": "0x0000000000000000000000000000000000000000",
    "decimals": 6
  },
  "created_at": "2026-06-28T00:00:00Z",
  "issuer": {
    "type": "wallet",
    "address": "0x0000000000000000000000000000000000000000"
  },
  "signature": {
    "type": "eip191",
    "value": "0x..."
  }
}
```

## Required Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `version` | integer | Manifest schema version |
| `card_id` | string | Immutable Coin Card identifier |
| `subject` | object | Public recipient identity being bound |
| `recipient` | object | Non-custodial payment destination |
| `network` | object | Blockchain network for the destination |
| `asset` | object | Payment asset for the destination |
| `created_at` | string | UTC timestamp when the payload was created |
| `issuer` | object | Entity or wallet authorizing the payload |
| `signature` | object | Creator signature over the canonical payload excluding `signature` |

### `version`

`version` MUST be an integer.

The initial version is:

```text
1
```

### `card_id`

`card_id` MUST be a globally unique, immutable, registry-resolvable identifier.

Allowed form:

```text
coincard:<category>:<slug>
```

Example:

```text
coincard:creator:brandon-lehman
```

`card_id` MUST NOT contain whitespace, executable content, HTML, CSS, URL query strings, or fragments.

### `subject`

`subject` identifies the public recipient identity.

Required fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `type` | string | Identity class |
| `name` | string | Human-readable public identity name |

Permitted `subject.type` values:

```text
person
creator
organization
project
merchant
```

`subject.name` MUST be plain text.

Additional subject types require a schema version revision.

### `recipient`

`recipient` defines the non-custodial payment destination.

Required fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `address` | string | Recipient wallet or contract address |

For EVM networks, `recipient.address` MUST be a valid 20-byte hexadecimal address.

### `network`

`network` defines the blockchain network for the destination.

Required fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `chain_id` | integer | Numeric chain ID |
| `name` | string | Lowercase network name |

For Polygon mainnet:

```json
{
  "chain_id": 137,
  "name": "polygon"
}
```

### `asset`

`asset` defines the payment asset.

Required fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `symbol` | string | Asset symbol |
| `contract` | string | Token contract address |
| `decimals` | integer | Token decimal precision |

`asset.symbol` MUST be uppercase.

`asset.decimals` MUST be an integer.

Ambiguous decimal amounts are not permitted in the manifest. The manifest defines identity and destination, not transfer amount.

### `created_at`

`created_at` MUST be an RFC 3339 UTC timestamp.

Example:

```text
2026-06-28T00:00:00Z
```

### `issuer`

`issuer` identifies the signer authority for the payload.

Required fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `type` | string | Issuer class |
| `address` | string | Issuer wallet address |

Permitted `issuer.type` values:

```text
wallet
```

For V1, the issuer is the creator wallet.

### `signature`

`signature` contains the signature over the canonical payload excluding `signature`.

Required fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `type` | string | Signature scheme |
| `value` | string | Signature bytes encoded as a hex string |

Permitted `signature.type` values:

```text
eip191
```

## Optional Fields

Optional fields are part of the canonical payload when present.

Optional fields MUST remain plain data. They MUST NOT contain HTML, CSS, JavaScript, executable content, inline event handlers, or presentation instructions.

| Field | Type | Meaning |
| --- | --- | --- |
| `display_name` | string | Short display label for the subject |
| `description` | string | Plain-language identity context |
| `website` | string | HTTPS URL associated with the subject |
| `avatar_uri` | string | HTTPS or content-addressed avatar reference |
| `reference_uri` | string | HTTPS URL for supporting public context |
| `metadata_uri` | string | HTTPS or content-addressed extended metadata reference |
| `expires_at` | string | UTC timestamp after which the payload is no longer intrinsically current |

Optional fields do not broaden the trust claim. They may provide context, but they do not establish business legitimacy, moral trustworthiness, legal compliance, transfer success, or reputation.

`reference_uri` is not a trust authority. It may point to supporting public context, but it does not verify the Coin Card.

When `expires_at` is absent, the payload has no intrinsic expiration. Registry status and revocation state may still invalidate operational use.

When `expires_at` is present, it MUST be an RFC 3339 UTC timestamp later than `created_at`. Expiration is part of the signed meaning. A verifier MUST reject an expired payload as not currently valid.

## Canonicalization Rules

Canonicalization converts the payload into the exact byte sequence used for signing and verification.

Rules:

- Encoding MUST be UTF-8.
- Object keys MUST be ordered lexicographically by Unicode code point.
- No insignificant whitespace is permitted.
- Strings MUST be JSON strings.
- Integers MUST be JSON numbers without fractional components.
- Null values are not permitted.
- Fields with empty strings are not permitted.
- Arrays are not permitted in V1.
- Unknown top-level fields MUST be rejected.
- Unknown nested fields MUST be rejected.
- The `signature` field MUST be excluded from the signed object.
- The `signature` field MUST be included in the complete manifest.

V1 prioritizes deterministic validation over forward compatibility. Unknown fields are rejected so implementers cannot silently attach new trust claims to an old schema.

Arrays are excluded in V1 to eliminate ordering ambiguity in the initial canonicalization model.

The canonical payload MUST NOT include:

- HTML
- CSS
- JavaScript
- markdown intended for rendering
- executable content
- visual layout instructions
- animation instructions
- iframe configuration
- tracking pixels
- mutable visual claims
- transfer amount
- fee amount
- payment guarantee language

## Signed Object

The signed object is the canonical payload excluding `signature`.

Example signed object:

```json
{
  "asset": {
    "contract": "0x0000000000000000000000000000000000000000",
    "decimals": 6,
    "symbol": "USDC"
  },
  "card_id": "coincard:creator:brandon-lehman",
  "created_at": "2026-06-28T00:00:00Z",
  "issuer": {
    "address": "0x0000000000000000000000000000000000000000",
    "type": "wallet"
  },
  "network": {
    "chain_id": 137,
    "name": "polygon"
  },
  "recipient": {
    "address": "0x0000000000000000000000000000000000000000"
  },
  "subject": {
    "name": "Brandon Lehman",
    "type": "person"
  },
  "version": 1
}
```

The complete manifest includes `signature` after signing.

The signature proves only that the issuer signed the canonical payment identity payload. It does not prove registry publication, revocation status, legal compliance, business legitimacy, recipient intent, or transfer success.

## Rejection Rules

Validators MUST reject a manifest when any of the following are true:

- `version` is unsupported
- any required field is missing
- any required field has the wrong type
- any field is null
- any string field is empty
- any unknown field is present
- `card_id` is malformed
- `subject.type` is unsupported
- `recipient.address` is invalid
- `network.chain_id` is unsupported
- `asset.symbol` is unsupported
- `asset.contract` is invalid
- `asset.decimals` is invalid
- timestamps are malformed
- `expires_at` is present and not later than `created_at`
- `expires_at` is present and the payload has expired
- `issuer.type` is unsupported
- `issuer.address` is invalid
- `signature.type` is unsupported
- `signature.value` is malformed
- signature verification fails
- canonicalization output does not match the signed bytes
- executable content is present
- presentation content is present
- transfer amount or fee amount is present
- guarantee, insurance, or trustworthiness language is present

Validators MUST NOT repair malformed payloads into validity.

Validators MAY report specific rejection reasons as evidence outputs.

## Versioning Rules

`version` governs the manifest schema.

Rules:

- Verifiers MUST reject unsupported versions.
- Verifiers MUST NOT silently downgrade unsupported versions.
- A version change MUST preserve the authority of the Coin Card Trust Model.
- New versions MUST NOT turn presentation into proof.
- New versions MUST NOT broaden Coin Card trust claims without constitutional review.
- New versions MUST define canonicalization before implementation.

Version `1` is the first schema governed by this document.

## Evidence Outputs

A validator MUST be able to derive these evidence outputs from a valid manifest:

| Evidence Output | Source |
| --- | --- |
| Identity binding | `subject` + `recipient` |
| Destination | `recipient.address` |
| Network | `network.chain_id` + `network.name` |
| Asset | `asset.symbol` + `asset.contract` + `asset.decimals` |
| Issuer | `issuer` |
| Signature scheme | `signature.type` |
| Signature validity | canonical payload + `signature.value` |
| Created timestamp | `created_at` |
| Expiration timestamp | `expires_at`, when present |
| Payload hash | canonical signed object bytes |
| Manifest version | `version` |
| Card identifier | `card_id` |

These evidence outputs support the trust model claim:

```text
This public recipient identity is bound to this specific payment destination
according to the signed canonical payload.
```

They do not establish registry publication, registry active status, revocation clearance, or current operational validity by themselves. Those require subordinate registry and revocation models.

## Closing Rule

The manifest defines the signed meaning of a Coin Card, not its appearance.

Any field, validator behavior, or future schema version that treats presentation as proof is not authorized by this document.
