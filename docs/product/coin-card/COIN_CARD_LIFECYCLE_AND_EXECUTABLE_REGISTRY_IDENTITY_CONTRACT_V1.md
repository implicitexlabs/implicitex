# Coin Card Lifecycle and Executable Registry Identity Contract v1

## Status

**Proposed — member of the three-contract evidence-authority promotion unit; not yet sealed.**

This document defines the exact lifecycle-record identity and executable Coin Card Registry identity bound by `transaction-evidence.v1`. It resolves overloaded registry and version names without changing the existing lifecycle runtime, lifecycle record schema, Solidity, manifests, deployment, or production wiring.

This contract, `COIN_CARD_TRANSACTION_EVIDENCE_CONTRACT_V1.md`, and `COIN_CARD_EXECUTION_INTERFACE_DESCRIPTOR_CONTRACT_V1.md` form one inseparable future promotion unit. None may be promoted as authority while either dependency remains Proposed. Their deterministic fixtures and focused tests are supporting conformance evidence, not normative authority.

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, and **MAY** are normative.

## 1. Authority boundaries

Phase 1C distinguishes these objects:

| Object | Authority | Not authority for |
|---|---|---|
| Lifecycle registry | Publication namespace and operational history for card/runtime lifecycle. | Payment recipient, token, executor, descriptor, or fee policy. |
| Authenticated lifecycle record | Exact signed operational assertion selected for one card and runtime manifest. | Payment route or transfer policy. |
| Executable Coin Card Registry V2 record | Exact published payment route and policy record whose hash and extracted fields are bound by Transaction Evidence. | Runtime code integrity, lifecycle outcome, sender, amount, or observed contract state. |
| Transaction Evidence | Signed conjunction of card/runtime identity, exact lifecycle-record identity, exact executable-registry identity, and payment authority. | Dynamic user intent or observed execution facts. |

No object may substitute for another. A shared `cardId`, revision, URI, display label, or friendly interface ID is not identity equality.

## 2. Closed identity vocabulary

`AuthenticatedCardAuthorityV1` uses these exact lifecycle fields:

| Field | Meaning |
|---|---|
| `lifecycleRegistryId` | Exact `registryId` of the authenticated lifecycle record. |
| `lifecycleRegistrySchemaVersion` | Exact lifecycle record `registrySchemaVersion`. |
| `lifecycleRecordId` | Exact stable `recordId` of the selected record. |
| `lifecycleRecordRevision` | Canonical atomic-string projection of the selected record's numeric `revision`. |
| `lifecycleRecordHash` | Domain-separated hash of the exact authenticated signed lifecycle record. |

It uses these exact executable-registry fields:

| Field | Meaning |
|---|---|
| `coinCardRegistryId` | Exact executable-registry namespace. |
| `coinCardRegistrySchemaVersion` | Exact value `coin-card-registry-record.v2`. |
| `coinCardRegistryRecordId` | Exact identifier of one revision-specific published record artifact. |
| `coinCardRegistryRecordRevision` | Canonical atomic-string record revision. |
| `coinCardRegistryRecordHash` | Domain-separated hash of the exact V2 record. |

The generic fields `lifecycleSchemaVersion`, `lifecycleVersion`, `registryRecordHash`, and `registryRecordRevision` are not part of the corrected `transaction-evidence.v1` authority. They MUST NOT be accepted as aliases. In particular:

- lifecycle `registryVersion` is global publication order and is not lifecycle record `revision`;
- lifecycle record `revision` is not executable-registry record `revision`; and
- descriptor version, evidence version, fee-policy version, contract generation, and either registry schema version remain independent namespaces.

## 3. Authenticated lifecycle-record identity

### 3.1 Existing record authority is retained

Phase 1C does not define a new lifecycle record. The selected record MUST satisfy `coin-card-lifecycle-registry-record.v1` and MUST first authenticate under `COIN_CARD_LIFECYCLE_RECORD_AUTHENTICATION_AND_CANONICALIZATION_CONTRACT_V1.md`, including its trusted publication key, environment, signature metadata, and exact signature value.

The record MUST then be selected and composed under the existing lifecycle selection and resolution contracts. Evidence-bound execution requires an authenticated operational outcome that permits use; a structurally valid or correctly signed blocked record is not execution authority.

Hashing, field comparison, or a matching `recordId` MUST NOT substitute for lifecycle signature authentication and operational selection.

### 3.2 Exact lifecycle-record hash

After authentication, the verifier MUST retain one immutable exact-record snapshot and calculate:

```text
lifecycleRecordHash = SHA256(
  UTF8("ImplicitEx.CoinCard.AuthenticatedLifecycleRecord.v1")
  || 0x00
  || UTF8(lifecycleCanonicalJson(exactAuthenticatedLifecycleRecord))
)
```

`lifecycleCanonicalJson` is the canonicalizer already defined by the lifecycle record authentication contract. The hashed object is the complete signed record as published, including `signature.value`; runtime verification output and caller-supplied verification context are excluded because they are not record fields.

The signature MUST be verified before this hash is trusted. Including `signature.value` makes the hash identify one exact authenticated publication artifact. Re-signing semantically identical content can produce a different ECDSA signature and therefore a different record hash; Transaction Evidence that names the earlier hash does not authorize the later artifact.

### 3.3 Required lifecycle conjunction

All of these equalities are mandatory:

```text
authority.lifecycleRegistryId            == record.registryId
authority.lifecycleRegistrySchemaVersion == record.registrySchemaVersion
authority.lifecycleRecordId               == record.recordId
authority.lifecycleRecordRevision         == decimalString(record.revision)
authority.lifecycleRecordHash             == lifecycleRecordHash
authority.environment                     == record.environment
authority.cardId                           == record.cardId
authority.runtimeManifestId                == record.manifestId
```

`record.revision` remains a safe nonnegative JSON integer under the existing lifecycle schema. `decimalString(record.revision)` is its base-10 representation with no sign or leading zero and becomes the atomic string used by Transaction Evidence. `record.registryVersion` remains covered by `lifecycleRecordHash` but MUST NOT be substituted for `lifecycleRecordRevision`.

A lifecycle identity mismatch is fatal even when the record signature is valid and its operational statuses appear permissive.

## 4. Executable Coin Card Registry Record V2

### 4.1 Purpose and authentication

`coin-card-registry-record.v2` is a normalized execution record. It contains no token symbols, chain labels, display names, formatted currency, URLs, timestamps, status labels, owner claims, or presentation metadata. Those facts may exist in a separate display record, but they cannot enter execution-field extraction.

The V2 record does not independently authorize payment. Its complete canonical hash is authenticated by inclusion in signed Transaction Evidence, and every extracted execution field must equal that same Transaction Evidence authority. An optional external catalog signature or transport assertion cannot replace either check.

### 4.2 Exact schema

`CoinCardRegistryRecordV2` contains exactly:

| Field | Type | Requirement |
|---|---|---|
| `registrySchemaVersion` | string | Exact value `coin-card-registry-record.v2`. |
| `registryId` | identifier | Executable-registry namespace selected by trusted publication policy. |
| `environment` | identifier | MUST equal Transaction Evidence environment. |
| `recordId` | identifier | Unique identifier for this revision-specific published artifact; a new revision MUST use a new record ID. |
| `revision` | atomic integer | Strictly increasing revision within `registryId` and `cardId`. A successor MUST be greater than the prior accepted revision; contiguity is not required. |
| `cardId` | identifier | Exact Coin Card identity. |
| `recipientAddress` | address | Canonical payment recipient. |
| `chainId` | atomic integer | EIP-155 chain ID. |
| `tokenContractAddress` | address | Canonical ERC-20 contract. |
| `executionContractAddress` | address | Canonical evidence-bound executor address. |
| `executionContractInterfaceId` | identifier | Friendly compatibility identifier. |
| `executionInterfaceDescriptorHash` | hash | Exact authenticated descriptor content hash. |
| `feePolicy` | `FeePolicyV1` | Exact policy object defined by Transaction Evidence. |

Objects use `coin-card-canonical-json.v1`. Atomic integers are decimal strings in `0..2^256-1`; EVM addresses are lowercase canonical nonzero addresses; hashes use lowercase `sha256:` form. Unknown, missing, duplicated, or additional fields are invalid. Record arrays, native JSON numbers, and implicit defaults are forbidden.

### 4.3 Exact-record hash

```text
coinCardRegistryRecordHash = SHA256(
  UTF8("ImplicitEx.CoinCard.ExecutableRegistryRecord.v2")
  || 0x00
  || UTF8(canonicalJson(exactCoinCardRegistryRecordV2))
)
```

Hashing an execution projection after discarding unknown or display fields is forbidden. The complete exact V2 record is the hash input.

### 4.4 Required extraction invariant

The verifier MUST establish both exact-record identity and field equality:

```text
authority.coinCardRegistryId             == record.registryId
authority.coinCardRegistrySchemaVersion  == record.registrySchemaVersion
authority.coinCardRegistryRecordId       == record.recordId
authority.coinCardRegistryRecordRevision == record.revision
authority.coinCardRegistryRecordHash     == hash(record)
authority.environment                    == record.environment
authority.cardId                          == record.cardId
authority.recipientAddress                == record.recipientAddress
authority.chainId                         == record.chainId
authority.tokenContractAddress            == record.tokenContractAddress
authority.executionContractAddress        == record.executionContractAddress
authority.executionContractInterfaceId    == record.executionContractInterfaceId
authority.executionInterfaceDescriptorHash== record.executionInterfaceDescriptorHash
authority.feePolicy                       == record.feePolicy
```

No hash from one record may be paired with fields from another. No record field may override Transaction Evidence. A matching record hash without extracted-field equality, or matching fields without the exact record hash, fails closed.

## 5. Currentness and anti-rollback

Exact identity does not establish that an artifact remains current. Evidence-bound execution MUST establish both current runtime lifecycle status and one current payment-authorization epoch immediately before intent authorization.

### 5.1 Fresh lifecycle selection and existing-model limitation

The runtime MUST obtain lifecycle evidence from the configured protected pipeline, never from a record or selection result supplied beside Transaction Evidence:

1. snapshot and authenticate the configured lifecycle bundle and every record under the existing lifecycle contracts;
2. perform card-only selection for authority `cardId` with `manifestId: null`;
3. resolve at one fresh authoritative runtime instant;
4. require exactly one focal record with `LIFECYCLE_ACTIVE`, `CARD_ACTIVE`, and `MANIFEST_CURRENT`; and
5. authenticate and hash that exact focal record under section 3.2.

The authority's lifecycle registry, schema, record ID, revision, hash, environment, card, and runtime manifest MUST equal the selected record. A caller-selected, cached, historical, superseded, or ambiguous record cannot satisfy this gate.

The checked-in lifecycle model cannot advance a publication while keeping one runtime manifest identity. Its selector permits one record per `(cardId, manifestId)` identity and treats another as ambiguous; successor lineage requires a different `manifestId`. Consequently, payment-only administration MUST NOT fabricate a new runtime manifest merely to create a lifecycle revision. The current static lifecycle bundle also reports `rollbackProtected: false`; it authenticates content but cannot establish currentness by itself.

### 5.2 Separate runtime and payment epochs

The lifecycle record remains the operational epoch for the runtime package. `executable-registry-head.v1` is the currentness sequencer for payment authority when route or policy changes without a runtime-package change.

Any change to recipient, chain, token, execution contract, interface descriptor, fee policy, or executable-registry revision requires:

- a new revision-specific executable Registry V2 record and exact record hash;
- new Transaction Evidence binding that record and its extracted fields; and
- a new authenticated head with a greater `headSequence` binding the new authority hash.

The new executable-registry revision MUST be strictly greater than the prior accepted revision. It need not equal the prior revision plus one: reserved, abandoned, or unpublished values may be skipped. An equal or lower revision is not a new payment epoch and fails with `PAYMENT_AUTHORIZATION_EPOCH_REUSE`.

Those changes do not require a new `runtimeManifestId`, lifecycle record ID, lifecycle revision, or lifecycle hash when the runtime package and lifecycle status are unchanged. If the runtime package changes, normal manifest lineage applies: the manifest ID and lifecycle identity MUST advance, and the new head and Transaction Evidence MUST bind them.

Historical Transaction Evidence authorities may therefore share `(cardId, lifecycleRecordHash)` sequentially. Exactly one may be current: the authority whose hash is bound by the authenticated current head. Competing current heads or authorities are fatal; implementations MUST NOT select by timestamp, route preference, or unsigned revision.

### 5.3 Closed `ExecutableRegistryHeadV1` schema

The head contains exactly these top-level fields:

| Field | Type | Requirement |
|---|---|---|
| `headSchemaVersion` | identifier | Exact `executable-registry-head.v1`. |
| `registryId` | identifier | Exact executable Registry V2 namespace. |
| `environment` | identifier | Exact publication environment. |
| `cardId` | identifier | Exact Coin Card identity. |
| `headSequence` | atomic integer | Monotonic value in `1..2^256-1`, scoped by `(registryId, environment, cardId)`. |
| `lifecycleRecordHash` | hash | Exact authenticated selected lifecycle-record hash. |
| `coinCardRegistryRecordId` | identifier | Exact current revision-specific V2 record ID. |
| `coinCardRegistryRecordRevision` | atomic integer | Exact current V2 revision. |
| `coinCardRegistryRecordHash` | hash | Exact current V2 record hash. |
| `transactionEvidenceAuthorityHash` | hash | Locally recomputed hash of the exact current Transaction Evidence authority. |
| `issuedAt` | timestamp | Canonical head-issuance instant. |
| `expiresAt` | timestamp | Canonical exclusive expiry instant. |
| `authorityId` | identifier | Trusted head-publication authority. |
| `signature` | `ExecutableRegistryHeadSignatureV1` | Exact signature envelope below. |

`ExecutableRegistryHeadSignatureV1` contains exactly:

| Field | Required value |
|---|---|
| `mode` | `signed-p256-v1` |
| `algorithm` | `ECDSA_P256_SHA256` |
| `signatureEncoding` | `ieee-p1363` |
| `signatureValueEncoding` | `base64url-unpadded` |
| `keyId` | Nonempty canonical identifier resolved by trusted-key policy. |
| `keyUsage` | Exact `coin-card-executable-registry-head`. |
| `authorityId` | MUST equal top-level `authorityId` and the trusted key's authority. |
| `signedAt` | MUST exactly equal top-level `issuedAt`. |
| `value` | Unpadded base64url encoding of exactly 64 P1363 signature bytes. |

The head uses `coin-card-canonical-json.v1`. Identifiers, atomic integers, and hashes use the rules in sections 4.2 through 4.4 of the Transaction Evidence contract. Every canonical head leaf is a string; arrays, `null`, booleans, native JSON numbers, duplicate/unknown/missing keys, non-NFC strings, and implicit defaults are forbidden.

Timestamps MUST match `YYYY-MM-DDTHH:mm:ss.sssZ`, denote a real UTC instant, and equal the result of canonical UTC millisecond reserialization. Leap seconds, offsets, omitted milliseconds, and noncanonical dates are invalid.

### 5.4 Canonical signature bytes and artifact hash

Let `headSignaturePayload` be an exact deep snapshot of the head with only `signature.value` omitted. The signature input is:

```text
UTF8("ImplicitEx.CoinCard.ExecutableRegistryHead.v1")
|| 0x00
|| UTF8(canonicalJson(headSignaturePayload))
```

The verifier MUST resolve `signature.keyId` from a trusted key source for the head environment, authority, issuance instant, and exact `coin-card-executable-registry-head` usage. It then verifies ECDSA P-256 with SHA-256 and strict 64-byte IEEE-P1363 encoding. DER, padded base64url, alternate domains, self-supplied keys, and otherwise-valid keys lacking the required usage are invalid.

After signature verification, the exact authenticated artifact hash is:

```text
executableRegistryHeadHash = SHA256(
  UTF8("ImplicitEx.CoinCard.ExecutableRegistryHeadArtifact.v1")
  || 0x00
  || UTF8(canonicalJson(exactHeadIncludingSignatureValue))
)
```

Its text form is lowercase `sha256:` hex. Re-signing identical head facts creates a distinct artifact hash and MUST be reconciled through the current source rather than silently substituted.

### 5.5 Time validity

V1 fixes `allowedClockSkewSeconds = 300` and `maximumLifetimeSeconds = 86400`. The verifier captures one authoritative `now` for the entire authorization attempt and requires:

```text
issuedAt < expiresAt
expiresAt - issuedAt <= 86,400 seconds
issuedAt - 300 seconds <= now
now < expiresAt + 300 seconds
signature.signedAt == issuedAt
```

The lower bound is inclusive and the upper bound is exclusive. Clock skew does not alter the signed timestamps or the persisted sequence. Malformed, premature, expired, reversed, or overlong intervals fail closed.

### 5.6 Authenticated source and monotonic sequence

A detached valid head signature proves authorship, not currentness. The verifier MUST obtain an authenticated source result that binds the exact `executableRegistryHeadHash` and scope `(registryId, environment, cardId)`. A transparency-log checkpoint, on-chain anchor, nonce-bound trusted freshness response, or anti-rollback protected release pin may satisfy this requirement only when its own verification contract prevents an attacker from choosing an older valid head. A self-asserted currentness flag is insufficient.

The verifier MUST maintain protected highest-seen state keyed by the canonical tuple `[registryId, environment, cardId]`; delimiter-built keys are forbidden. Each state value contains `headSequence` and `executableRegistryHeadHash`.

- `headSequence < highestSeenSequence` is rollback and fails.
- Equal sequences are accepted only when the exact head hash also equals the protected hash.
- Equal sequence with a different hash is equivocation and fails.
- Greater sequences are accepted without requiring contiguity, then the sequence and exact hash MUST be atomically persisted before currentness is returned.
- A sequence value MUST never be reused for different head content.

Authenticated source verification is required even when local highest-seen state is empty; first use cannot trust a detached signature alone.

### 5.7 Exact head conjunction

After independently authenticating Transaction Evidence, the lifecycle record, Registry V2 record, and head, the verifier requires:

```text
head.registryId                         == authority.coinCardRegistryId
head.registryId                         == record.registryId
head.environment                        == authority.environment
head.environment                        == record.environment
head.cardId                             == authority.cardId
head.cardId                             == record.cardId
head.lifecycleRecordHash                == authority.lifecycleRecordHash
head.lifecycleRecordHash                == freshSelectedLifecycleRecordHash
head.coinCardRegistryRecordId           == authority.coinCardRegistryRecordId
head.coinCardRegistryRecordId           == record.recordId
head.coinCardRegistryRecordRevision     == authority.coinCardRegistryRecordRevision
head.coinCardRegistryRecordRevision     == record.revision
head.coinCardRegistryRecordHash         == authority.coinCardRegistryRecordHash
head.coinCardRegistryRecordHash         == hash(record)
head.transactionEvidenceAuthorityHash   == locallyRecomputedAuthorityHash
```

The immutable currentness result MUST retain the exact head snapshot, its artifact hash, sequence, source mechanism, and captured time through intent authorization. The head selects one current authority but does not independently supply or override payment fields. A head mismatch cannot be cured by matching route values.

### 5.8 Availability rule

The present rollback-unprotected lifecycle source requires this authenticated head path—or an equivalent protected release source that pins the exact lifecycle hash, Registry V2 record hash, Transaction Evidence authority hash, and monotonic payment epoch. Until one such source is implemented and available, the correct evidence-bound runtime result is `LIFECYCLE_CURRENTNESS_UNAVAILABLE`.

## 6. Legacy boundary and migration

The following are legacy/non-executable schemas:

- `implicitex.coincard.v1`, used by current presentation-oriented registry files; and
- the Phase 1B `coin-card-registry-record.v1` hash/extraction scaffold.

Neither can be treated as, aliased to, or automatically projected into `coin-card-registry-record.v2`. A shared `cardId`, recipient, chain label, token symbol, `feeBps`, or revision does not confer V2 identity.

Legacy records do not deterministically supply all required facts, including at least:

- governed V2 schema, registry ID, environment, revision-specific record ID, and revision;
- canonical token-contract address;
- evidence-bound execution-contract address;
- execution-interface descriptor hash;
- cap enablement and atomic cap;
- minimum and maximum transfer bounds;
- transfer precision;
- exact rounding semantics;
- fee-policy semantics version; and
- fee-recipient address.

Migration MUST NOT infer these values from token symbols, chain names, client constants, current contract state, explorer metadata, or defaults. Even a value present in a legacy display record is not execution authority and MUST be explicitly re-authorized in V2. Migration is new governed publication:

1. explicitly supply every V2 field from an authorized source;
2. validate the exact V2 schema, canonical encodings, descriptor, and deployed route assumptions;
3. assign a governed V2 `registryId`, revision-specific `recordId`, and revision;
4. publish the exact V2 record and calculate its content hash; and
5. issue new Transaction Evidence that signs that exact hash and repeats every extracted execution field.

Legacy records remain usable only for their existing display/legacy semantics. Missing facts, a migration map, or a same-card assertion cannot make them evidence-bound executable records.

## 7. Verification order

The evidence-bound verifier MUST:

1. authenticate Transaction Evidence;
2. freshly select the unique operational lifecycle record from the protected content-authenticated source using card-only selection;
3. verify lifecycle registry/schema/record/revision/hash equality and executable operational outcome;
4. resolve and validate the exact V2 executable-registry record;
5. verify its registry/schema/record/revision/hash equality;
6. verify every V2 extracted execution field against Transaction Evidence;
7. authenticate and time-check the exact current head, authenticate its current source, enforce its protected monotonic sequence, and verify the complete section 5.7 conjunction; and
8. continue to descriptor, frozen-intent, observed-policy, atomic-guard, and settlement checks.

Later success cannot cure an earlier identity mismatch. Implementations MUST NOT compare only hashes, only IDs, or only extracted route fields.

## 8. Deterministic rejection taxonomy

| Code | Condition |
|---|---|
| `LIFECYCLE_RECORD_UNAUTHENTICATED` | Lifecycle signature/trusted-key authentication was not established. |
| `LIFECYCLE_OUTCOME_NOT_EXECUTABLE` | Authenticated selected lifecycle outcome does not permit execution. |
| `LIFECYCLE_CURRENTNESS_UNAVAILABLE` | Lifecycle source authenticates content but does not establish a current, anti-rollback head. |
| `LIFECYCLE_AUTHORIZATION_EPOCH_MISMATCH` | Transaction Evidence binds a lifecycle record other than the freshly selected current record. |
| `LIFECYCLE_AUTHORIZATION_EPOCH_REUSE` | Runtime manifest or lifecycle state changed without advancing exact lifecycle identity. |
| `PAYMENT_AUTHORIZATION_EPOCH_REUSE` | Payment route or policy changed without a strictly greater V2 revision, new authority hash, and greater authenticated head sequence. |
| `LIFECYCLE_REGISTRY_ID_MISMATCH` | Signed lifecycle registry ID differs from selected record. |
| `LIFECYCLE_SCHEMA_MISMATCH` | Signed lifecycle record schema differs from selected record or is unsupported. |
| `LIFECYCLE_RECORD_ID_MISMATCH` | Signed lifecycle record ID differs from selected record. |
| `LIFECYCLE_RECORD_REVISION_MISMATCH` | Signed lifecycle record revision differs from selected record revision. |
| `LIFECYCLE_RECORD_HASH_MISMATCH` | Exact authenticated lifecycle-record hash differs. |
| `ENVIRONMENT_MISMATCH` | Authenticated lifecycle environment differs from Transaction Evidence. |
| `CARD_ID_MISMATCH` | Authenticated lifecycle card differs from Transaction Evidence. |
| `RUNTIME_MANIFEST_MISMATCH` | Authenticated lifecycle manifest differs from Transaction Evidence runtime manifest. |
| `COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED` | Executable record is not exact `coin-card-registry-record.v2`. |
| `COIN_CARD_REGISTRY_ID_MISMATCH` | Signed executable-registry ID differs from record. |
| `COIN_CARD_REGISTRY_RECORD_ID_MISMATCH` | Signed executable record ID differs from record. |
| `COIN_CARD_REGISTRY_REVISION_MISMATCH` | Signed executable record revision differs from record. |
| `COIN_CARD_REGISTRY_RECORD_HASH_MISMATCH` | Exact V2 record hash differs. |
| `COIN_CARD_REGISTRY_EXECUTION_FIELD_MISMATCH` | Any extracted execution field differs from Transaction Evidence. |
| `LEGACY_REGISTRY_NOT_EXECUTABLE` | Legacy/display record is presented as V2 execution authority. |
| `REGISTRY_MIGRATION_FACT_MISSING` | Migration omits or invents a required V2 fact. |
| `TRANSACTION_EVIDENCE_AUTHORITY_CONFLICT` | The authenticated current source exposes competing current Transaction Evidence authorities. |
| `EXECUTABLE_REGISTRY_HEAD_SCHEMA_INVALID` | Head schema, scalar encoding, timestamp encoding, or signature-envelope shape is invalid. |
| `EXECUTABLE_REGISTRY_HEAD_SIGNATURE_INVALID` | Head signature, algorithm, encoding, domain, key resolution, or authority binding is invalid. |
| `EXECUTABLE_REGISTRY_HEAD_KEY_USAGE_INVALID` | Resolved key lacks exact `coin-card-executable-registry-head` usage. |
| `EXECUTABLE_REGISTRY_HEAD_TIME_INVALID` | Head is premature, expired, reversed, or exceeds the maximum lifetime under fixed skew rules. |
| `EXECUTABLE_REGISTRY_HEAD_SOURCE_CURRENTNESS_UNAVAILABLE` | No authenticated source binds the exact head artifact hash and scope. |
| `EXECUTABLE_REGISTRY_HEAD_SEQUENCE_ROLLBACK` | Head sequence is below protected highest-seen state. |
| `EXECUTABLE_REGISTRY_HEAD_SEQUENCE_EQUIVOCATION` | One sequence is associated with two different authenticated head hashes. |
| `EXECUTABLE_REGISTRY_HEAD_MISMATCH` | Authenticated head disagrees with lifecycle, Registry V2, or Transaction Evidence. |

More specific existing route rejection codes MAY be returned after exact record identity is established, but they MUST NOT make a cross-record merge acceptable.

## 9. Deterministic vectors

The normative fixture is `coin-card.lifecycle-and-registry-identity.fixtures.v1.json`. Focused tests MUST pin:

- one valid P-256-authenticated lifecycle record and its exact canonical record hash;
- lifecycle registry, schema, record ID, revision, record hash, card, environment, and manifest equality;
- distinction between lifecycle `registryVersion` and record `revision`;
- fresh card-only current lifecycle selection accepting the exact epoch and rejecting historical/superseded records;
- proof that the existing lifecycle selector cannot publish a same-manifest successor;
- one closed canonical head, signed-payload bytes, valid P-256 signature, exact artifact hash, and property-order variant;
- one-field head mutations plus malformed schema, wrong domain, wrong key usage, wrong key, and signature mutation;
- premature, expired, reversed, and overlong head intervals at the fixed clock-skew boundaries;
- absent or mismatched authenticated source currentness, sequence rollback, equal-sequence replay, and equal-sequence equivocation;
- complete head equality against lifecycle, Registry V2, and Transaction Evidence;
- a payment-route revision advancing the head and Transaction Evidence while retaining the unchanged runtime manifest and lifecycle identity;
- acceptance of a noncontiguous strictly greater V2 revision and rejection of equal or lower revisions;
- rejection of a payment-route change that does not advance the authenticated payment epoch;
- one-field lifecycle mutations, including validly shaped but unauthenticated content;
- one exact executable V2 record, canonical JSON, and record hash;
- equality for descriptor hash and every execution-critical V2 field;
- property-order independence and rejection of unknown fields/native numbers;
- executable-registry ID, record ID, revision, hash, and extracted-field mutations;
- rejection of `implicitex.coincard.v1` and `coin-card-registry-record.v1` as executable authority; and
- migration vectors proving that every V2 leaf absent from or non-authoritative in legacy input requires explicit authenticated input.

## 10. Specification non-goals

This contract does not:

- modify or replace the existing lifecycle registry runtime or record verifier;
- populate an executable production registry;
- deploy an authenticated current-head service or freshness anchor;
- migrate a checked-in legacy record;
- implement registry resolution in the Coin Card runtime;
- alter Solidity, manifests, deployment, or production wiring;
- implement the closed Phase 1D execution predicates in runtime code; or
- promote any member of the three-contract evidence-authority unit from `Proposed` status.
