# Coin Card Signed Manifest Envelope Contract v1

Status: contract proposal

Purpose: define the canonical signed Coin Card payment-instruction claim. This
contract builds on trusted-key resolution; it does not decide card lifecycle,
presentation eligibility, or execution authority.

## Authority Boundary

The signed envelope answers:

> What exact card, issuer, recipient, network, asset, amount policy, revision,
> and payload hash did the authorized signer claim?

It does not answer:

> Is this manifest still current or operational?

That question belongs to the lifecycle registry contract.

`VERIFIED` authenticates the payment instruction. It does not, by itself, make a
transfer executable. IX execution remains separate and must independently
enforce wallet, network, amount, recipient, balance, approval, fee, and
transaction-state requirements.

## Canonical Signed Fields

The signed envelope must provide one canonical claim:

```text
schemaVersion
manifestId
cardId
revision
previousManifestId
issuerId
keyId
environment
signedAt
validFrom
validUntil
recipient
network
asset
amountPolicy
payloadHash
```

No resolver or lifecycle decision may use alternate unsigned copies of these
fields.

## Field Semantics

- `schemaVersion`: exact envelope schema identifier.
- `manifestId`: stable identifier for this manifest envelope.
- `cardId`: enduring Coin Card identity across manifest revisions.
- `revision`: positive integer revision for this `cardId`.
- `previousManifestId`: `null` for revision `1`; otherwise the immediately
  preceding manifest claimed by the issuer.
- `issuerId`: issuer asserted by the signed envelope and passed to trusted-key
  resolution.
- `keyId`: trusted key record identifier used for signature verification.
- `environment`: trust domain for this manifest, such as `production` or
  `test`.
- `signedAt`: issuer assertion of signing time, covered by the signature.
- `validFrom`: earliest issuer-declared operational time.
- `validUntil`: latest issuer-declared operational time, or `null` when the
  issuer does not declare an envelope expiration.
- `recipient`: canonical payment recipient facts.
- `network`: canonical network facts.
- `asset`: canonical asset facts.
- `amountPolicy`: canonical amount semantics for the payment instruction.
- `payloadHash`: digest binding this envelope to the protected manifest payload.

V1 timestamps must use the same strict UTC millisecond format required by the
trusted-key record contract:

```text
YYYY-MM-DDTHH:mm:ss.sssZ
```

`signedAt` is an issuer assertion covered by the signature. It is not objective
third-party timestamp evidence. A future lifecycle registry, transparency log,
receipt, blockchain anchor, or timestamping authority may add stronger timing
evidence, but V1 does not assume it.

## Payment Fact Schemas

`recipient` must be a plain-data object:

```text
address
```

The recipient address is interpreted inside the signed `network` context. V1
must not duplicate `chainNamespace` or `chainId` inside `recipient`.

`network` must be a plain-data object:

```text
chainNamespace
chainId
```

`asset` must be a plain-data object:

```text
standard
contractAddress
symbol
decimals
```

Native-asset instructions may use `contractAddress: null` only when the
`standard` explicitly permits a native asset.

## Amount Policy

`amountPolicy` must be a canonical plain-data object with a `type` field exactly
equal to one of:

```text
OPEN_AMOUNT
FIXED_AMOUNT
MINIMUM_AMOUNT
BOUNDED_AMOUNT
```

V1 amount values must be canonical non-negative integer strings in asset base
units. Decimal display formatting is presentation-only. The canonical string
`"0"` is allowed. Leading zeros, negative signs, decimal points, exponent
notation, empty strings, and non-string numeric values are invalid.

Allowed shapes are:

```json
{
  "type": "OPEN_AMOUNT"
}
```

```json
{
  "type": "FIXED_AMOUNT",
  "amountBaseUnits": "50000000"
}
```

```json
{
  "type": "MINIMUM_AMOUNT",
  "minAmountBaseUnits": "1000000"
}
```

```json
{
  "type": "BOUNDED_AMOUNT",
  "minAmountBaseUnits": "1000000",
  "maxAmountBaseUnits": "100000000"
}
```

Unexpected fields, missing required fields, fields forbidden for the selected
policy type, and `minAmountBaseUnits` greater than `maxAmountBaseUnits` are
invalid.

## Payload Hash

The envelope must pin the protected payload hash contract:

```text
payloadHashAlgorithm: SHA-256
payloadHashEncoding: base64url-unpadded
payloadCanonicalization: coin-card-canonical-json.v1
payloadType: coin-card-protected-payload.v1
payloadDomain: ImplicitEx Coin Card Protected Payload v1
```

`payloadHash` is:

```text
SHA-256(payloadDomain || 0x00 || canonical protected payload bytes)
```

where `payloadDomain` is encoded as UTF-8, and the digest is encoded as
unpadded base64url.

The canonical protected payload bytes must exclude:

- the envelope signature value;
- lifecycle registry data;
- transport metadata;
- runtime verification output;
- `payloadHash` itself when the envelope is contained within the hashed
  payload.

The domain separator prevents identical bytes from being reused as another
signed artifact type. Canonicalization is defined in
`COIN_CARD_LIFECYCLE_RECORD_AUTHENTICATION_AND_CANONICALIZATION_CONTRACT_V1.md`.

## Payload Canonicalization

The signature payload must be deterministic:

- include every canonical signed field listed by this contract;
- exclude the signature value, transport metadata, UI-only fields, and runtime
  registry state;
- serialize objects with stable key ordering;
- preserve array order only where the schema declares arrays meaningful;
- reject duplicate authorization fields unless every supplied copy exactly
  matches the canonical signed value.

Changing `keyId`, `issuerId`, `environment`, `signedAt`, payment facts,
`amountPolicy`, `revision`, `previousManifestId`, or `payloadHash` must change
the signed payload and invalidate the signature.

## Manifest Revision Chaining

The envelope may assert revision continuity, but it cannot prove registry
acceptance or currentness:

- Revision `1` must declare `previousManifestId: null`.
- Later envelopes must claim the immediately preceding manifest in
  `previousManifestId`.

The signed envelope alone cannot prove that the predecessor is registry-current,
that the revision was accepted, that no competing revision exists, or that a
rollback did not occur. The lifecycle registry independently determines whether
the revision claim is acceptable and current.
