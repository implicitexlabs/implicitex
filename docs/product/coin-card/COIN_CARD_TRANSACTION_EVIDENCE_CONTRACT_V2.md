# Coin Card Transaction Evidence Contract v2

Date: 2026-07-22

**Sealed — signing-time reconciliation authority. Not implemented, wired, or production-eligible.**

## 1. Purpose and version boundary

This contract repairs the authentication gap in sealed
`transaction-evidence.v1`: the v1 signed authority has no signing time and no
signed key identifier, while trusted-key resolution requires both values to
come from signed content.

`transaction-evidence.v2` is a new closed authority schema. It does not change
the meaning of sealed v1. It imports the route, policy, canonical JSON,
Registry V2, descriptor, lifecycle, current-head, intent, observation,
settlement, and rejection-order rules of
`COIN_CARD_TRANSACTION_EVIDENCE_CONTRACT_V1.md` except where this contract
explicitly replaces the authority schema, authority hash domain, signature
payload, trusted-key schema, or authentication outcomes.

Sealed v1 evidence may remain parseable as historical content, but it cannot
establish signature authentication or execution eligibility under v2. A v2
authentication path receiving v1 evidence fails with
`TRANSACTION_EVIDENCE_SIGNATURE_PROFILE_REQUIRED`.

This contract and
`COIN_CARD_TRUSTED_PUBLIC_KEY_RECORD_CONTRACT_V2.md` form one sealed
signing-time reconciliation unit. Neither may be promoted independently.

## 2. Three-object trust model remains unchanged

V2 does not move dynamic intent or observed execution facts into issuer
authority:

1. `AuthenticatedCardAuthorityV2` authenticates the card route, policy,
   signing time, and signing-key identity.
2. Frozen user intent supplies the sender and requested amount permitted by
   that authority.
3. The observed execution environment supplies provider, account, pinned-block
   state, contract observations, and settlement evidence.

The sealed descriptor and lifecycle/Registry identity contracts remain the
normative dependencies for execution semantics and currentness. V2 adds no new
payment field and changes no fee, route, current-head, or atomic-guard rule.

## 3. Canonical authority and hash

### 3.1 Exact authority schema

`AuthenticatedCardAuthorityV2` MUST contain exactly these fields:

| Field | Type | Rule |
|---|---|---|
| `evidenceDomain` | string | Exact value `ImplicitEx.CoinCard.TransactionEvidence`. |
| `evidenceSchemaVersion` | string | Exact value `transaction-evidence.v2`. |
| `issuerId` | identifier | Exact issuer resolved by trusted-key policy. |
| `environment` | identifier | Exact trusted-key and publication environment. |
| `signedAt` | timestamp | Authenticated signing time defined in section 5. |
| `signingKeyId` | identifier | Authenticated trusted-key record identifier. |
| `cardId` | identifier | Same meaning and validation as v1. |
| `runtimeManifestId` | hash | Same meaning and validation as v1. |
| `lifecycleRegistryId` | identifier | Same meaning and validation as v1. |
| `lifecycleRegistrySchemaVersion` | identifier | Same meaning and validation as v1. |
| `lifecycleRecordId` | identifier | Same meaning and validation as v1. |
| `lifecycleRecordRevision` | atomic integer | Same meaning and validation as v1. |
| `lifecycleRecordHash` | hash | Same meaning and validation as v1. |
| `coinCardRegistryId` | identifier | Same meaning and validation as v1. |
| `coinCardRegistrySchemaVersion` | identifier | Exact value `coin-card-registry-record.v2`. |
| `coinCardRegistryRecordId` | identifier | Same meaning and validation as v1. |
| `coinCardRegistryRecordRevision` | atomic integer | Same meaning and validation as v1. |
| `coinCardRegistryRecordHash` | hash | Same meaning and validation as v1. |
| `recipientAddress` | address | Same meaning and validation as v1. |
| `chainId` | atomic integer | Same meaning and validation as v1. |
| `tokenContractAddress` | address | Same meaning and validation as v1. |
| `executionContractAddress` | address | Same meaning and validation as v1. |
| `executionContractInterfaceId` | identifier | Same meaning and validation as v1. |
| `executionInterfaceDescriptorHash` | hash | Same meaning and validation as v1. |
| `feePolicy` | `FeePolicyV1` | Exact unchanged v1 fee-policy object. |

Unknown, omitted, duplicated, inherited, accessor-backed, non-enumerable, or
non-data properties fail closed. `signedAt` and `signingKeyId` are authority
fields, not unsigned wrapper metadata.

### 3.2 Canonical serialization

V2 uses `coin-card-canonical-json.v1` exactly as sealed v1 does: UTF-8,
Unicode-scalar and NFC validation, lexicographic Unicode code-point property
ordering, closed property sets, canonical JSON strings, atomic integers encoded
as canonical decimal strings, lowercase canonical addresses and hashes, and no
locale-dependent representation.

The V2 authority signature and hash domain is:

```text
ImplicitEx.CoinCard.TransactionEvidence.v2
```

For canonical authority JSON text `C`, the exact hash and signature payload is:

```text
UTF8("ImplicitEx.CoinCard.TransactionEvidence.v2") || 0x00 || UTF8(C)
```

The authority hash is SHA-256 over those bytes and is encoded as lowercase
`sha256:` plus 64 lowercase hexadecimal characters. The issuer signature is
ECDSA P-256 with SHA-256 over those same bytes. Signature bytes are fixed-width
IEEE P1363 `r || s` and unpadded base64url.

Because `signedAt` and `signingKeyId` are in `C`, changing either invalidates
both the authority hash and signature.

## 4. Exact evidence wrapper

The v2 wrapper retains the five-field transport shape:

```json
{
  "authority": {},
  "authorityHash": "sha256:...",
  "keyId": "issuer-key-id",
  "signature": "unpadded-base64url",
  "signatureAlgorithm": "ECDSA_P256_SHA256_P1363"
}
```

The wrapper MUST contain exactly those fields. The verifier MUST require:

```text
wrapper.authorityHash == locally recomputed v2 authority hash
wrapper.keyId         == authority.signingKeyId
wrapper.signatureAlgorithm == "ECDSA_P256_SHA256_P1363"
```

`wrapper.keyId` is only a lookup hint. It cannot select a different key record
from the signed `authority.signingKeyId`. A mismatch fails with
`EVIDENCE_SIGNING_KEY_ID_MISMATCH` before key resolution.

## 5. Signing-time semantics

`authority.signedAt` MUST be a canonical UTC millisecond timestamp:

```text
YYYY-MM-DDTHH:mm:ss.sssZ
```

It is the instant at which the issuer produced the Transaction Evidence
signature. Omission, `null`, an empty value, a timezone offset, missing
milliseconds, impossible calendar values, noncanonical round-tripping, or any
other representation fails with `EVIDENCE_SIGNING_TIME_INVALID` before
authority-hash comparison or key resolution.

The trusted-key resolver receives:

```text
keyId           = authority.signingKeyId
usage           = "coin-card-transaction-evidence"
issuerId        = authority.issuerId
environment     = authority.environment
signatureTime   = authority.signedAt
verificationTime = verifier-controlled current time
```

`verificationTime` MUST NOT come from Transaction Evidence, Registry V2,
lifecycle data, an executable-registry head, URL input, or caller input. The
resolver's fixed five-minute future-skew rule applies.

Signing time is key-eligibility evidence, not payment-authority currentness and
not an evidence expiration time. Currentness still requires the exact
authenticated executable-registry head and protected highest-seen state. An old
signature may remain usable only when the trusted-key revocation policy permits
it and a fresh current head continues to select its exact authority hash.

The selected current head MUST satisfy:

```text
authority.signedAt <= head.issuedAt
```

A later authority signing time fails with
`EVIDENCE_SIGNING_TIME_AFTER_HEAD`. Lifecycle publication time and head
signature time MUST NOT be substituted for `authority.signedAt`.

## 6. Trusted-key authorization

The key source MUST resolve a closed `coin-card-trusted-key-record.v2` record
under `COIN_CARD_TRUSTED_PUBLIC_KEY_RECORD_CONTRACT_V2.md`. The record MUST:

- have exact `keyId == authority.signingKeyId`;
- have exact `issuerId == authority.issuerId`;
- have exact `environment == authority.environment`;
- include exact usage `coin-card-transaction-evidence`;
- authorize `authority.signedAt` under activation, validity, status, and
  revocation rules; and
- resolve to `TRUSTED_KEY_ACTIVE` at verifier-controlled `verificationTime`.

Only `TRUSTED_KEY_ACTIVE` may provide public-key material. Every other
trusted-key outcome maps to top-level `EVIDENCE_SIGNATURE_INVALID`; the
underlying deterministic key outcome SHOULD remain available as non-authority
diagnostic detail.

Key validity never replaces signature verification. After successful key
resolution, the P-256 signature MUST verify over the exact bytes in section
3.2. A malformed, noncanonical, wrong-length, or cryptographically invalid
signature fails with `EVIDENCE_SIGNATURE_INVALID`.

## 7. Deterministic verification order

V2 authentication uses this order:

1. require the exact five-field wrapper and exact V2 authority property set;
2. validate canonical scalar, address, integer, fee-policy, hash, `signedAt`,
   and `signingKeyId` encodings;
3. require the V2 evidence domain and schema version;
4. require the exact signature algorithm and canonical P1363 signature text;
5. recompute and compare `authorityHash`;
6. compare unsigned wrapper `keyId` with signed `authority.signingKeyId`;
7. resolve the V2 trusted-key record using only signed authority inputs and
   verifier-controlled time;
8. verify the signature over the exact V2 domain-separated authority bytes;
9. require `authority.signedAt <= currentHead.issuedAt` when currentness is
   evaluated;
10. continue with unchanged Registry V2 equality, lifecycle, head currentness,
    intent, pinned observation, execution, and settlement rules.

A stale declared hash cannot conceal malformed signing time. A key-policy
failure cannot be reported as signature success. No result becomes
authenticated, current, or execution-eligible until every required stage has
passed.

## 8. Stable reconciliation outcomes

| Outcome | Meaning |
|---|---|
| `TRANSACTION_EVIDENCE_SIGNATURE_AUTHENTICATED` | V2 content, hash, trusted-key policy, and P-256 signature passed. It does not establish lifecycle/head currentness or execution eligibility. |
| `TRANSACTION_EVIDENCE_SIGNATURE_PROFILE_REQUIRED` | A v2 authentication path received evidence without the v2 signed-time/key profile. |
| `EVIDENCE_SIGNING_TIME_INVALID` | `authority.signedAt` is missing, malformed, or noncanonical. |
| `EVIDENCE_SIGNING_KEY_ID_MISMATCH` | Unsigned wrapper lookup key differs from signed authority key ID. |
| `EVIDENCE_SIGNING_TIME_AFTER_HEAD` | Authenticated evidence claims a signing time later than the selecting head's issue time. |
| `EVIDENCE_HASH_MISMATCH` | Declared authority hash differs from the locally recomputed V2 hash. |
| `EVIDENCE_SIGNATURE_INVALID` | Trusted-key resolution did not authorize the signature, or signature bytes/verification failed. |

All unchanged v1 outcomes retain their sealed meanings.

## 9. Conformance evidence

The deterministic fixture is
`coin-card.transaction-evidence-signature.fixtures.v2.json`. Its focused test
MUST prove:

- the exact V2 canonical authority, domain-separated hash, and P-256 P1363
  signature;
- property-order invariance;
- `signedAt` and `signingKeyId` signature binding;
- unsigned wrapper key mismatch rejection;
- malformed signing-time precedence over stale hash;
- activation, valid-until, environment, issuer, usage, and future-skew rules;
- `INVALIDATE_ALL_SIGNATURES`, `INVALIDATE_AFTER_TIMESTAMP`, and
  `NO_NEW_SIGNATURES`, including the exact revocation boundary;
- expired-key behavior and invalid signature bytes;
- authority signing time versus current-head issue time; and
- the repinned authenticated-head signature and artifact hash.

Fixtures are public conformance data, not production keys, production
signatures, currentness sources, or deployment authorization.

## 10. Implementation boundary

This sealed contract authorizes no runtime changes. A later implementation
increment must independently add V2 content support, trusted-key-record v2
resolution, signature verification, and fail-closed result branding. It MUST
remain standalone and execution-ineligible until lifecycle/head currentness and
the rest of the sealed execution conjunction are separately implemented and
reviewed.
