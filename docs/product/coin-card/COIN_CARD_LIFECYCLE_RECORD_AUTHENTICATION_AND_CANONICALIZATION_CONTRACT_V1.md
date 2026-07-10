# Coin Card Lifecycle Record Authentication and Canonicalization Contract v1

Status: contract proposal

Purpose: define byte-level canonicalization, lifecycle record signatures,
operational outcome composition, registry bundle freshness limits, and
administration evidence hashing before lifecycle resolver runtime work begins.

## Canonical JSON

Coin Card V1 signed and hashed payloads use:

```text
coin-card-canonical-json.v1
```

Canonical JSON rules:

- Encode canonical text as UTF-8.
- Emit no insignificant whitespace.
- Objects must be plain-data objects with no getters, setters, symbols,
  functions, unexpected prototypes, `undefined`, `NaN`, or infinities.
- Object keys are sorted by Unicode scalar value/code point, not ECMAScript
  UTF-16 code-unit order. Implementations must use a comparator that compares
  full code points.
- Strings are enclosed in double quotes.
- String escaping must use JSON escapes for quotation mark, reverse solidus, and
  control characters U+0000 through U+001F. Use `\b`, `\t`, `\n`, `\f`, and
  `\r` for those five controls; use lowercase `\u00xx` for other controls.
  Solidus `/` must not be escaped.
- Unicode text must contain only valid Unicode scalar values and must already be
  normalized to NFC; non-NFC strings and unpaired UTF-16 surrogates are invalid.
- Environments without string normalization support must fail canonicalization
  closed.
- Booleans serialize only as `true` or `false`.
- `null` is allowed only where the schema explicitly allows it.
- Optional fields must be omitted unless the field contract explicitly requires
  a present `null`.
- Arrays are allowed only where the schema declares them; array order is
  meaningful.
- Raw JSON input with duplicate object keys is invalid before canonicalization.
- Numbers are allowed only where a schema explicitly permits them. Permitted V1
  numbers must be safe integers serialized as base-10 JSON numbers without a
  plus sign, decimal point, exponent, leading zeros, or negative zero. Coin
  Card amount values must remain canonical integer strings in base units.

## Payload Hash Vector

Domain:

```text
ImplicitEx Coin Card Protected Payload v1
```

Input object:

```json
{
  "cardId": "card_test_001",
  "recipient": {
    "address": "0x1111111111111111111111111111111111111111"
  },
  "amountPolicy": {
    "type": "FIXED_AMOUNT",
    "amountBaseUnits": "50000000"
  }
}
```

Canonical UTF-8 text:

```json
{"amountPolicy":{"amountBaseUnits":"50000000","type":"FIXED_AMOUNT"},"cardId":"card_test_001","recipient":{"address":"0x1111111111111111111111111111111111111111"}}
```

SHA-256 hexadecimal digest over
`domain || 0x00 || canonical UTF-8 text`:

```text
3ed60d0c409d735bdfe467b96f0af0379b077fdfbc4c8ae9a30882766dfd7eda
```

Unpadded base64url digest:

```text
PtYNDECdc1vf5Ge5bwrwN5sHf9-8TIrpowiCdm39fto
```

## Unicode Ordering Vector

Input object:

```json
{
  "😀": 5,
  "𐀀": 4,
  "Ω": 3,
  "é": 2,
  "a": 1
}
```

Canonical UTF-8 text:

```json
{"a":1,"é":2,"Ω":3,"𐀀":4,"😀":5}
```

## String Escaping Vector

Input object:

```json
{
  "label": "Café \"A\"\n😀/test",
  "nul": "\u0000",
  "tab": "\t",
  "slash": "/",
  "backslash": "\\"
}
```

Canonical UTF-8 text:

```json
{"backslash":"\\","label":"Café \"A\"\n😀/test","nul":"\u0000","slash":"/","tab":"\t"}
```

## Lifecycle Record Signature Schema

A signed lifecycle registry record must include:

```text
registrySchemaVersion: coin-card-lifecycle-registry-record.v1
```

This field is part of the signed payload and defines the schema under which the
record's bytes and semantics are interpreted.

A lifecycle registry record signature must be a plain-data object:

```json
{
  "mode": "signed-p256-v1",
  "algorithm": "ECDSA_P256_SHA256",
  "signatureEncoding": "ieee-p1363",
  "signatureLengthBytes": 64,
  "signatureValueEncoding": "base64url-unpadded",
  "keyId": "registry-publication-key-2026-01",
  "authorityId": "implicitex-registry",
  "signedAt": "2026-07-10T08:00:00.000Z",
  "value": "base64url-unpadded-signature"
}
```

The signature payload must cover every lifecycle registry record field and
signature metadata field except `signature.value` and runtime verification
output.

Record authentication must begin from a plain-data snapshot with a standard
plain-object prototype or `null` prototype. Custom prototypes and arrays are
not valid lifecycle-record inputs in V1.

Lifecycle record signatures are domain separated. The verifier signs and
verifies:

```text
UTF8("ImplicitEx Coin Card Lifecycle Registry Record v1")
|| 0x00
|| UTF8(canonical lifecycle record signature payload)
```

`signature.value` must encode the fixed-width IEEE P1363 ECDSA representation
`r || s`, where `r` and `s` are each 32-byte big-endian integers for P-256.
ASN.1 DER signatures are invalid in V1. The canonical textual representation is
exactly 86 unpadded base64url characters and must round trip by decoding and
re-encoding to the same string.

Duplicate authorization fields are forbidden outside the canonical lifecycle
record and its signature object. When a field is intentionally repeated inside
`signature`, the values must match exactly:

- `signature.keyId` resolves the publication key.
- `signature.authorityId` must equal lifecycle record `authorityId`.
- `signature.signedAt` must be covered by the signed payload.

Record publication time must also be internally consistent:

- `signature.signedAt` must be less than or equal to `publishedAt`.
- `publishedAt` must not be later than verification time plus the configured
  clock skew.

## Registry Publication Key Binding

The lifecycle record verifier must resolve `signature.keyId` through the trusted
key resolver with usage:

```text
coin-card-registry-publication
```

The trusted key record must satisfy:

- trusted key record `issuerId` equals lifecycle record `authorityId` unless a
  future trusted-key schema adds an explicit authority identity field;
- trusted key environment equals lifecycle record `environment`;
- trusted key usage includes `coin-card-registry-publication`;
- trusted key timing and revocation policy authorize `signature.signedAt` and
  verification time.

The trusted publication key must also import successfully as a P-256 public
key before signature verification proceeds. Import failure is distinct from a
signature mismatch.

Only `TRUSTED_KEY_ACTIVE` may expose public key material for lifecycle record
signature verification.

## Lifecycle State Compatibility

Lifecycle resolution must return detailed outcomes and one composed operational
outcome:

```javascript
{
  cardOutcome: 'CARD_ACTIVE',
  manifestOutcome: 'MANIFEST_CURRENT',
  operationalOutcome: 'LIFECYCLE_OPERATIONAL'
}
```

Composed outcomes:

```text
LIFECYCLE_OPERATIONAL
LIFECYCLE_BLOCKED
LIFECYCLE_UNKNOWN
LIFECYCLE_INVALID
```

Decision table:

| Card outcome | Manifest outcome | Operational outcome |
| --- | --- | --- |
| `CARD_ACTIVE` | `MANIFEST_CURRENT` | `LIFECYCLE_OPERATIONAL` |
| `CARD_ACTIVE` | `MANIFEST_SUPERSEDED` | `LIFECYCLE_BLOCKED` |
| `CARD_ACTIVE` | `MANIFEST_EXPIRED` | `LIFECYCLE_BLOCKED` |
| `CARD_ACTIVE` | `MANIFEST_REVOKED` | `LIFECYCLE_BLOCKED` |
| `CARD_ACTIVE` | `MANIFEST_UNKNOWN` | `LIFECYCLE_UNKNOWN` |
| `CARD_ACTIVE` | `MANIFEST_RECORD_INVALID` | `LIFECYCLE_INVALID` |
| `CARD_SUSPENDED` | any recognized manifest outcome | `LIFECYCLE_BLOCKED` |
| `CARD_REVOKED` | any recognized manifest outcome | `LIFECYCLE_BLOCKED` |
| `CARD_UNKNOWN` | any manifest outcome | `LIFECYCLE_UNKNOWN` |
| `CARD_RECORD_INVALID` | any manifest outcome | `LIFECYCLE_INVALID` |

Presentation code must consume the composed `operationalOutcome`; it must not
reinterpret card and manifest outcomes independently.

## Registry Bundle and Rollback Limitation

The first static implementation may use a protected empty registry bundle:

```text
registryId
environment
registryVersion
generatedAt
entries
```

The empty bootstrap bundle schema is exact. It must contain only:

```text
registrySchemaVersion
registryId
environment
registryVersion
generatedAt
entries
```

For the empty production bootstrap, `registryId` must be
`implicitex-production`, `environment` must be `production`, `registryVersion`
must be `0`, `generatedAt` must be `null`, and `entries` must be an empty deeply
frozen array.

Source validation of the empty bundle proves only frozen plain-data shape and
the exact empty schema. It does not independently prove package-integrity
authentication; that proof comes from the separate Coin Card Integrity Manifest
verification path.

For the first static implementation, each non-empty lifecycle record must be
individually signed by the registry publication authority. The protected
registry bundle is an integrity-protected application asset; it is not
separately bundle-signed in V1.

`generatedAt` is publication metadata only. It is not independent freshness
evidence. Runtime diagnostics should expose:

```javascript
{
  sourceValidated: true,
  bundleIntegrityAuthenticated: false,
  recordAuthentication: 'not-applicable-empty',
  rollbackProtected: false,
  registryVersion: 0,
  generatedAt: null
}
```

Rollback resistance requires a later freshness mechanism such as a locally
persisted highest-seen `registryVersion`, a signed current-registry head, a
transparency log, an on-chain registry anchor, a trusted freshness endpoint, or
a protected application release that pins the expected registry head.

For V1 static bundles, deployment integrity provides release-level freshness and
registry signatures provide authority authenticity.

## Administration Evidence Hash

Administration evidence hashes use:

```text
administrationEvidenceHashAlgorithm: SHA-256
administrationEvidenceHashEncoding: base64url-unpadded
administrationEvidenceCanonicalization: coin-card-canonical-json.v1
administrationEvidenceDomain: ImplicitEx Coin Card Lifecycle Administration Evidence v1
```

`administrationEvidenceHash` is:

```text
SHA-256(administrationEvidenceDomain || 0x00 || canonical evidence bytes)
```

where the domain is encoded as UTF-8 and the digest is encoded as unpadded
base64url.

The base64url digest must be canonical: decoding and re-encoding must produce
the exact same text.

`administrationEvidenceHash` is required when a lifecycle registry record is
based on an external lifecycle administration request. It must be `null` only
when the registry publication authority creates a record without external
administration evidence under a documented registry policy.

Runtime validation must accept only `null` or a 43-character canonical
unpadded-base64url SHA-256 digest.

## Administration Evidence Action Schema

Administration evidence should use this minimal canonical shape before hashing:

```text
evidenceSchemaVersion
action
cardId
manifestId
environment
requestedAt
effectiveFrom
reasonCode
authorityId
nonce
```

Allowed actions:

```text
SUSPEND_CARD
RESTORE_CARD
REVOKE_CARD
REVOKE_MANIFEST
SUPERSEDE_MANIFEST
```

The evidence action, `cardId`, `manifestId`, `environment`, effective time, and
authority identity must match the lifecycle registry record that references the
evidence hash.

## Runtime Implementation Status

Implemented in the protected browser runtime:

- individual lifecycle-record authentication;
- synthetic lifecycle-record authentication tests;
- protected runtime module `card/coin-card-lifecycle-record-verification.js`.
- immutable pre-verification snapshots for authenticated records;
- exact schema discriminator and signature domain separation;
- canonical base64url signature and evidence-hash validation;
- strict publication-time ordering checks.

Not implemented in this slice:

- populated lifecycle registry entries;
- registry record selection;
- lifecycle state resolution from authenticated entries;
- presentation promotion from authenticated lifecycle records;
- execution eligibility from authenticated lifecycle records.
