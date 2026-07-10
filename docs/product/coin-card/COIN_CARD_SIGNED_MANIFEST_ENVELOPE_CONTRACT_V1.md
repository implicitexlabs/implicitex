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
  preceding accepted manifest.
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
chainNamespace
chainId
```

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

`amountPolicy` must be exactly one of:

```text
OPEN_AMOUNT
FIXED_AMOUNT
MINIMUM_AMOUNT
BOUNDED_AMOUNT
```

V1 amount values must be canonical non-negative integer strings in asset base
units. Decimal display formatting is presentation-only.

- `OPEN_AMOUNT`: no signed amount constraint.
- `FIXED_AMOUNT`: requires `amountBaseUnits`.
- `MINIMUM_AMOUNT`: requires `minAmountBaseUnits`.
- `BOUNDED_AMOUNT`: requires `minAmountBaseUnits` and `maxAmountBaseUnits`;
  the minimum must be less than or equal to the maximum.

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

Revision rules are defined here, but currentness is decided by the lifecycle
registry:

- The first accepted manifest for a card must use `revision: 1` and
  `previousManifestId: null`.
- A successor manifest must use `revision` exactly one greater than its
  predecessor.
- A successor manifest must name the registry-current predecessor in
  `previousManifestId`.
- Duplicate revisions for a card are invalid.
- Rollback to an earlier revision is forbidden.

The signed envelope alone cannot prove that a manifest is current. It can only
prove the issuer-signed claim that the lifecycle registry will later evaluate.
