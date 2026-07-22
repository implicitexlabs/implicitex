# Coin Card Transaction Evidence Contract v1

## Status

**Proposed — member of the three-contract evidence-authority promotion unit; not yet sealed.**

This document proposes the v1 specification for binding an authenticated Coin Card to a later user-approved transfer and to the execution facts observed from the selected wallet provider and the confirmed chain event. Phase 1A defines its authority hierarchy and legacy-manifest compatibility, Phase 1B binds the content-addressed execution-interface descriptor, Phase 1C defines lifecycle/registry identity and authenticated currentness, and Phase 1D closes the specification-level conformance matrix. Promotion to authoritative status still requires explicit review and approval; passing specification fixtures does not implement this contract or prove production eligibility.

This contract, `COIN_CARD_EXECUTION_INTERFACE_DESCRIPTOR_CONTRACT_V1.md`, and `COIN_CARD_LIFECYCLE_AND_EXECUTABLE_REGISTRY_IDENTITY_CONTRACT_V1.md` form one inseparable future promotion unit. None may be promoted while another remains Proposed. Their fixtures and focused tests substantiate conformance but are not normative authorities.

This increment defines data, canonicalization, validation, and rejection behavior only. It does not wire the contract into the runtime, regenerate a manifest, sign an artifact, or change a deployment.

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, and **MAY** are normative.

## 1. Security statement

A successful authorization under this contract means:

> The issuer authenticated this exact card, runtime artifact, registry record, recipient route, chain, token, execution contract, and policy; the user reviewed and approved an exact frozen transfer permitted by that authority; and the same provider, account, chain, contract state, transaction, and confirmed event were observed throughout execution.

No one of those clauses is sufficient by itself.

The Coin Card authority does **not** pre-authorize a particular transfer amount or sender. Amount and sender are dynamic user intent. A later authorization step MUST prove that the frozen intent is permitted by, and exactly consistent with, the authenticated authority and the observed execution environment.

## 2. The three-object model

The transaction trust boundary contains three distinct objects. Implementations MUST NOT collapse their authority or freshness properties.

### 2.1 Authenticated Card Authority

`AuthenticatedCardAuthorityV1` is issuer-authenticated evidence. It defines the route and policy within which a later transfer may be authorized.

It answers: **what has the issuer authorized this card to do?**

It contains no sender address, requested amount, fee quote, allowance, balance, provider selection, transaction hash, or receipt fact.

### 2.2 Frozen User Intent

`FrozenUserIntentV1` is the exact transaction reviewed by the user. It is created after amount entry and wallet selection, is immutable after review, and is bound to one authenticated authority hash.

It answers: **what exact transfer is this account presently approving?**

It is not issuer-signed evidence. Its authority comes from exact comparison to authenticated card authority, observed account and chain facts, and the user's wallet approval.

### 2.3 Observed Execution Environment

`ObservedExecutionEnvironmentV1` is fresh runtime evidence obtained through the selected EIP-1193 provider. `ObservedSettlementV1` is the confirmed chain event obtained through that same provider binding.

Together they answer: **where will this transfer execute, what is the contract's live policy, and what actually happened?**

These observations are not issuer assertions. They MUST be freshly obtained, pinned to the same provider by object identity or an equally strong non-forgeable runtime binding, and rejected when they disagree with either the authority or the frozen intent.

```text
authenticated card authority
              |
              | permits and constrains
              v
       frozen user intent  <---- exact account/chain/policy ---- observed preflight
              |
              | same provider + exact transaction
              v
       confirmed settlement <---- decoded TransferExecuted event
```

## 3. Relationship to existing contracts

This contract composes with, rather than replaces:

- `COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md` for issuer and key authority;
- `COIN_CARD_LIFECYCLE_RECORD_AUTHENTICATION_AND_CANONICALIZATION_CONTRACT_V1.md` for `coin-card-canonical-json.v1`;
- the lifecycle selection, resolution, and presentation-promotion contracts for deciding which authenticated lifecycle evidence is operational;
- `COIN_CARD_REVIEW_SNAPSHOT_AND_INTERACTION_PROJECTION_CONTRACT_V1.md` for review immutability;
- `COIN_CARD_EXECUTION_INTERFACE_DESCRIPTOR_CONTRACT_V1.md` for content-addressed EVM interface, policy-guard, and event semantics; and
- `COIN_CARD_EXECUTION_AUTHORIZATION_CONTRACT_V1.md` for one-shot authorization and consumption.

Where the existing execution-authorization contract validates only the shape or readiness of an intent field, this contract adds the REQUIRED semantic comparison to authenticated authority and observed execution facts. An implementation MUST satisfy both contracts. A shape-valid but semantically mismatched intent is unauthorized.

### 3.1 Singular execution-authority ownership

The system uses several authenticated or observed objects, but they do not own the same facts. Execution eligibility is a conjunction of independently scoped authorities, not a precedence contest in which one valid signature may override another.

| Object | Authoritative for | Not authoritative for |
|---|---|---|
| Signed runtime manifest | Runtime files, artifact hashes, runtime version, issuer/key identity, declared runtime capabilities, and compatible specification identifiers. | Recipient, chain, token, execution contract, or fee policy for evidence-bound execution. |
| Transaction Evidence authority | Card identity and the exact execution route and policy permitted to the authenticated runtime. | Sender account, requested amount, live wallet readiness, live contract state, or settlement facts. |
| Authenticated lifecycle record | Whether the card/runtime evidence is current, active, suspended, revoked, superseded, expired, or otherwise operational. It may block use of Transaction Evidence. | Recipient, token, chain, execution contract, fee policy, or user amount. |
| Exact Coin Card registry record | The published data object whose complete canonical hash and extracted execution projection must equal Transaction Evidence. | Independent execution authority. Registry values cannot override Transaction Evidence even when the registry publication is authenticated. |
| Authenticated execution-interface descriptor | Deployed-code identity, ABI, selector, argument encoding, state getters, policy-guard semantics, revert behavior, and event decoding. | Card recipient or card-specific policy values. |
| Frozen user intent | The sender and exact transfer presently reviewed and approved within authenticated authority. | Permission to expand or replace the authenticated route or policy. |
| Observed execution and settlement | Fresh provider/account/chain/contract facts and the confirmed event that actually occurred. | Issuer authority or permission to tolerate a mismatch. |

The Transaction Evidence authority is the sole normative source of card-specific execution route and policy in the evidence-bound model. Every other object either authenticates code/semantics, determines operational usability, constrains compatibility, supplies dynamic intent, or reports observed facts.

### 3.2 Conjunction and conflict rule

Evidence-bound execution requires all applicable authorities and observations to agree:

```text
verified runtime package
AND valid Transaction Evidence authority
AND operational authenticated lifecycle evidence
AND exact registry hash and extracted-field equality
AND authenticated compatible interface descriptor
AND frozen intent permitted by authority
AND fresh observed execution facts equal authority and intent
```

There is no last-writer-wins or signature-precedence rule. If two authenticated objects disagree, neither value wins and execution MUST be rejected. A lower-scope object may block a higher-scope authority but MUST NOT create missing authority or substitute a value.

A valid legacy manifest without valid Transaction Evidence MUST NOT authorize evidence-bound execution. It fails with `TRANSACTION_EVIDENCE_REQUIRED`. Legacy V1 execution, if retained, is a separate compatibility path and MUST NOT claim compliance with this contract.

### 3.3 Legacy signed-manifest compatibility

The legacy signed manifest-envelope proposal contains payment fields that overlap the Transaction Evidence authority. Those fields cannot be silently discarded while a payment-bearing legacy envelope remains in use.

For `transaction-evidence.v1`:

> Transaction Evidence is the normative execution authority. Authenticated legacy payment fields are compatibility constraints only. Every overlapping extracted value MUST equal Transaction Evidence, and every non-overlapping legacy amount restriction MUST be satisfied. Any disagreement is fatal.

Compatibility comparison occurs only after the legacy envelope and Transaction Evidence have independently passed schema, canonicalization, trusted-key, signature, issuer, and environment verification. An unauthenticated legacy object is never compared as if it were authority.

The runtime derives an immutable `LegacyManifestCompatibilityProjectionV1` from the authenticated legacy envelope. The projection is not separately signed and MUST NOT contain values from an unsigned runtime registry or UI state.

| Authenticated legacy value | Required compatibility rule |
|---|---|
| `manifestId` | MUST equal `authority.runtimeManifestId`. |
| `cardId` | MUST equal `authority.cardId`. |
| `issuerId` | MUST equal `authority.issuerId`. Trusted key IDs MAY differ when both keys are independently authorized for their usages. |
| `environment` | MUST equal `authority.environment`. |
| `recipient.address` | Its schema-valid canonical EVM address MUST equal `authority.recipientAddress`. |
| `network.chainNamespace` | MUST identify EIP-155; v1 canonical projection value is exactly `eip155`. |
| `network.chainId` | Its canonical atomic projection MUST equal `authority.chainId`. |
| `asset.standard` | MUST be exactly `ERC20` for the v1 evidence-bound route. |
| `asset.contractAddress` | Its schema-valid canonical address MUST equal `authority.tokenContractAddress`. |
| `amountPolicy` | MUST satisfy section 3.4. |

Legacy `asset.symbol`, `asset.decimals`, network names, and display labels do not identify the execution asset and MUST NOT override the token-contract address or atomic arithmetic. If displayed, they require separate equality to observed token metadata; otherwise they MUST be omitted from the trusted review projection.

A later payment-free runtime-manifest schema MAY omit all legacy payment fields. Absence under that explicitly compatible schema creates no compatibility constraint. Partial omission from a legacy schema that declares the fields required remains a legacy manifest schema failure, not permission to skip comparison.

### 3.4 Legacy amount-policy compatibility

Legacy amount policy may restrict dynamic intent but can never enlarge the Transaction Evidence policy. Let:

```text
authorityMinimum = uint(authority.feePolicy.minimumTransferAtomic)
authorityMaximum = uint(authority.feePolicy.maximumTransferAtomic)
precision        = uint(authority.feePolicy.transferPrecisionAtomic)

AuthorityAmounts = {
  amount | authorityMinimum <= amount <= authorityMaximum
           and amount % precision == 0
}
```

Each legacy policy MUST resolve to an `EffectiveAmounts` set that is a subset of `AuthorityAmounts`:

| Legacy type | Compatibility rule |
|---|---|
| `OPEN_AMOUNT` | Adds no legacy amount restriction. `EffectiveAmounts = AuthorityAmounts`. |
| `FIXED_AMOUNT` | The fixed atomic amount MUST belong to `AuthorityAmounts`. `EffectiveAmounts` contains only that amount. |
| `MINIMUM_AMOUNT` | The legacy minimum MUST be precision-valid and within the inclusive authority range. `EffectiveAmounts` is the subset of `AuthorityAmounts` greater than or equal to the legacy minimum. |
| `BOUNDED_AMOUNT` | The legacy minimum MUST be no lower than the authority minimum, the legacy maximum MUST be no higher than the authority maximum, both bounds MUST be precision-valid, and the legacy minimum MUST be no greater than the legacy maximum. `EffectiveAmounts` is the inclusive intersection of `AuthorityAmounts` and the legacy interval. |

A legacy atomic value is precision-valid only when `value % precision == 0`. A legacy policy MUST be rejected if it would enlarge either authority bound, contains a noncanonical or precision-invalid value, produces an empty intersection, or uses an unknown policy type. These conditions fail with `CROSS_AUTHORITY_AMOUNT_POLICY_MISMATCH`.

When frozen intent is present, `uint(intent.amountSentAtomic)` MUST belong to `EffectiveAmounts`. An otherwise compatible legacy policy whose frozen amount is outside that effective set, including a `FIXED_AMOUNT` mismatch, fails with `AMOUNT_POLICY_VIOLATION`. Compatibility MAY be resolved before intent exists, but evidence-bound execution MUST NOT proceed until the frozen amount has passed this membership test.

No legacy value replaces or rewrites the Transaction Evidence bounds. Implementations MAY retain an effective inclusive interval for evaluation, but the authenticated authority and legacy compatibility projection remain separate immutable inputs.

### 3.5 Cross-authority verification order

The compatibility gate MUST evaluate in this order:

1. independently authenticate the runtime manifest and legacy envelope, when present;
2. independently authenticate Transaction Evidence;
3. require Transaction Evidence for the evidence-bound path;
4. derive the immutable legacy compatibility projection only from authenticated legacy fields;
5. compare identity and environment;
6. compare recipient, chain, and token route;
7. reconcile legacy amount policy; and
8. continue to lifecycle, registry, descriptor, intent, observation, and settlement gates.

Cross-authority mismatch codes MUST NOT conceal an invalid signature or malformed source object. No compared legacy value is copied into Transaction Evidence, frozen intent, or the execution plan.

### 3.6 Version vocabulary

These versions identify different things and MUST remain distinct in code, documentation, telemetry, and release artifacts:

```text
ImplicitExTransferV1                  legacy deployed transfer contract
ImplicitExEvidenceBoundTransferV2     future atomic-policy-guard contract
transaction-evidence.v1               payment-authority evidence schema
execution-interface-descriptor.v1     authenticated ABI/guard descriptor schema
coin-card-registry-record.v2          normalized executable registry schema
```

An interface-descriptor schema version, evidence schema version, registry schema version, fee-policy version, lifecycle revision, contract product generation, and deployment revision are never interchangeable.

## 4. Canonical scalar types

### 4.1 Addresses

Every signed or hashed EVM address MUST be a JSON string matching:

```text
^0x[0-9a-f]{40}$
```

The all-zero address is invalid for every address in this contract. Mixed-case checksum forms, uppercase hex, missing `0x`, shortened forms, and non-EVM labels are noncanonical and MUST be rejected rather than normalized after signature verification.

An implementation MAY accept a user-entered checksum address before freezing intent, but MUST convert it to the lowercase canonical form before review, hashing, or comparison.

### 4.2 Atomic unsigned integers

Chain IDs, revisions, block coordinates, amounts, basis points, and other integers in any canonical object defined here MUST be JSON strings matching:

```text
^(0|[1-9][0-9]*)$
```

They MUST denote values in the inclusive range `0` through `2^256 - 1`, unless a field has a narrower range. A leading plus sign, leading zero, sign, decimal point, exponent, whitespace, hexadecimal form, JavaScript number, `BigInt`, `NaN`, or infinity is invalid.

Monetary values are token atomic units. Formatted USDC strings, decimal display values, token symbols, chain names, and locale-dependent values MUST NOT enter the canonical authority, intent, observation, settlement, or executable-registry fields. Presentation metadata belongs to a separate display record and MUST NOT be extracted or interpreted as execution authority.

`feeBasisPoints` additionally MUST be in `0..10000`.

### 4.3 Hashes

Hash fields MUST be lowercase strings matching:

```text
^sha256:[0-9a-f]{64}$
```

The prefix is part of the value.

### 4.4 Identifiers and enums

Identifiers and enums MUST be non-empty NFC-normalized Unicode scalar strings with no leading or trailing whitespace. Their case is significant. Each field's allowed values are closed by its schema version.

## 5. Canonical serialization and cryptography

### 5.1 Encoding version

All canonical objects in v1 use `coin-card-canonical-json.v1`, defined by `COIN_CARD_LIFECYCLE_RECORD_AUTHENTICATION_AND_CANONICALIZATION_CONTRACT_V1.md`.

For this contract, that means:

- input is plain data with data properties only;
- strings contain only Unicode scalar values and are NFC-normalized;
- object keys are emitted in ascending Unicode code-point order;
- there is no insignificant whitespace;
- JSON string escaping follows the shared canonicalization contract;
- arrays are permitted only where a schema declares them, their order is meaningful, and v1 schemas below declare no arrays;
- duplicate JSON keys, accessors, symbols, functions, cycles, sparse arrays, and undeclared properties are invalid;
- native JSON numbers are forbidden in the v1 objects below;
- every field listed as required MUST be present; and
- omitted values are invalid. Explicit `null` is valid only for `feeCapAtomic`, with the meaning specified in section 6.2.

The tables below list logical schema fields. Serialized member order is always the Unicode code-point order produced by `coin-card-canonical-json.v1`; source property insertion order is irrelevant.

Canonical text MUST be encoded as UTF-8 without a byte-order mark.

### 5.2 Domain-separated hashes

The exact v1 domains are:

```text
authority signature/hash: ImplicitEx.CoinCard.TransactionEvidence.v1
authenticated lifecycle: ImplicitEx.CoinCard.AuthenticatedLifecycleRecord.v1
executable registry:      ImplicitEx.CoinCard.ExecutableRegistryRecord.v2
current-head signature:   ImplicitEx.CoinCard.ExecutableRegistryHead.v1
current-head artifact:    ImplicitEx.CoinCard.ExecutableRegistryHeadArtifact.v1
frozen intent hash:       ImplicitEx.CoinCard.FrozenUserIntent.v1
```

For domain `D` and canonical JSON text `C`, the hash input is:

```text
UTF8(D) || 0x00 || UTF8(C)
```

The hash is SHA-256. Its canonical text form is lowercase `sha256:` followed by 64 lowercase hexadecimal characters.

Domain separation is mandatory. A digest calculated under one domain MUST NOT be accepted under another.

### 5.3 Signature

The issuer signature covers the exact domain-separated bytes for the canonical `AuthenticatedCardAuthorityV1` object. The v1 signature algorithm is ECDSA P-256 with SHA-256. Signature bytes use fixed-width IEEE P1363 `r || s` encoding and unpadded base64url text.

Signature metadata is carried outside the signed authority object:

```json
{
  "authority": {},
  "authorityHash": "sha256:...",
  "keyId": "issuer-key-id",
  "signature": "unpadded-base64url",
  "signatureAlgorithm": "ECDSA_P256_SHA256_P1363"
}
```

The wrapper MUST contain exactly those fields. `authorityHash` MUST equal the locally recomputed authority hash before signature verification. Key resolution and issuer authorization follow the trusted-key contracts. No signature or digest is accepted merely because it is self-consistent.

### 5.4 Version upgrades

`transaction-evidence.v1` is a closed schema. Unknown versions, fields, enum values, signature algorithms, or domains MUST fail closed. A later version MUST use a new schema-version value and a new hash/signature domain. Verifiers MUST NOT reinterpret a later object using v1 rules, and MUST NOT silently discard fields to make an object fit v1.

## 6. Authenticated Card Authority schema

### 6.1 Exact object

`AuthenticatedCardAuthorityV1` MUST contain exactly these fields:

| Field | Type | Meaning |
|---|---|---|
| `evidenceDomain` | string | Exact value `ImplicitEx.CoinCard.TransactionEvidence`. |
| `evidenceSchemaVersion` | string | Exact value `transaction-evidence.v1`. |
| `issuerId` | identifier | Issuer resolved by trusted key policy. |
| `environment` | enum | Publication environment; v1 fixture uses `production`. |
| `cardId` | identifier | Coin Card identity. |
| `runtimeManifestId` | hash | Exact verified runtime package manifest or artifact hash. |
| `lifecycleRegistryId` | identifier | Exact registry namespace of the authenticated lifecycle record. |
| `lifecycleRegistrySchemaVersion` | identifier | Exact schema of the authenticated lifecycle record. |
| `lifecycleRecordId` | identifier | Exact stable identifier of the selected lifecycle record. |
| `lifecycleRecordRevision` | atomic integer | Canonical string projection of selected lifecycle record `revision`. |
| `lifecycleRecordHash` | hash | Domain-separated hash of the complete authenticated lifecycle record, including its signature value. |
| `coinCardRegistryId` | identifier | Exact executable Coin Card Registry namespace. |
| `coinCardRegistrySchemaVersion` | identifier | Exact value `coin-card-registry-record.v2`. |
| `coinCardRegistryRecordId` | identifier | Exact identifier of one revision-specific executable-registry publication artifact. |
| `coinCardRegistryRecordRevision` | atomic integer | Exact executable-registry record revision. |
| `coinCardRegistryRecordHash` | hash | Domain-separated hash of the complete exact executable V2 record. |
| `recipientAddress` | address | Recipient of `amountSentAtomic`. |
| `chainId` | atomic integer | EIP-155 chain ID; never a network label. |
| `tokenContractAddress` | address | ERC-20 contract debited by execution. |
| `executionContractAddress` | address | Contract called to execute the transfer. |
| `executionContractInterfaceId` | identifier | Closed identifier for the approved callable/event/state interface and its atomic policy guard. |
| `executionInterfaceDescriptorHash` | hash | Domain-separated content hash of the exact authenticated `execution-interface-descriptor.v1`. |
| `feePolicy` | `FeePolicyV1` | Exact issuer-authenticated policy. |

`runtimeManifestId` binds the card authority to a verified runtime artifact. The lifecycle record that promotes the card MUST bind the same lifecycle registry, schema, record ID, record revision, exact authenticated record hash, `cardId`, environment, and manifest identity. Presentation promotion alone does not excuse these equality checks. `lifecycleRecordRevision` is the record's card/manifest revision and MUST NOT be populated from global lifecycle `registryVersion`.

The executable-registry fields bind the exact `coin-card-registry-record.v2` defined by `COIN_CARD_LIFECYCLE_AND_EXECUTABLE_REGISTRY_IDENTITY_CONTRACT_V1.md`. The legacy generic names `lifecycleSchemaVersion`, `lifecycleVersion`, `registryRecordHash`, and `registryRecordRevision` are forbidden aliases and are not fields of this closed authority schema.

`executionContractInterfaceId` is a compatibility name only. It MUST equal the resolved descriptor's `interfaceId`, but it cannot authenticate descriptor content. `executionInterfaceDescriptorHash` is the normative interface-semantics binding and MUST equal the locally recomputed descriptor hash defined by the execution-interface descriptor contract.

### 6.2 FeePolicyV1

`FeePolicyV1` MUST contain exactly:

| Field | Type | Meaning |
|---|---|---|
| `policyVersion` | identifier | Closed policy semantics identifier. |
| `feeBasisPoints` | atomic integer | Numerator over the fixed denominator 10,000. |
| `feeCapAtomic` | atomic integer or `null` | Maximum fee in token atomic units; `null` means the approved interface is explicitly uncapped. |
| `minimumTransferAtomic` | atomic integer | Inclusive live-contract minimum for `amountSentAtomic`; MUST be greater than zero. |
| `maximumTransferAtomic` | atomic integer | Inclusive issuer maximum for `amountSentAtomic`; MUST be at least the minimum. |
| `transferPrecisionAtomic` | atomic integer | `amountSentAtomic` MUST be an exact multiple; MUST be greater than zero. |
| `roundingRule` | enum | Exact value `FLOOR_BPS_THEN_CAP`. |
| `feeRecipientAddress` | address | Live contract destination for `feeAmountAtomic`. |

For `FLOOR_BPS_THEN_CAP`:

```text
BPS_DENOMINATOR = 10000
require 0 <= feeBasisPoints <= BPS_DENOMINATOR

rawFee = mulDivFloor(amountSentAtomic, feeBasisPoints, BPS_DENOMINATOR)
feeAmountAtomic = feeCapAtomic is null
  ? rawFee
  : min(rawFee, feeCapAtomic)

require amountSentAtomic <= UINT256_MAX - feeAmountAtomic
totalDebitedAtomic = amountSentAtomic + feeAmountAtomic
```

`mulDivFloor` is exact floor division using a full 512-bit intermediate product or equivalent full-precision algorithm; an overflowing 256-bit multiplication before division is forbidden. Cap application occurs after flooring. Zero fee is valid. Basis points above 10,000 are invalid policy, and total-debit overflow rejects execution before token movement. Fee calculation MUST use the same local policy snapshot used to construct and enforce the policy commitment. The confirmed event's fee and total debit MUST be independently reconstructed from this equation; matching requested values alone is insufficient. Display rounding is irrelevant.

`maximumTransferAtomic` is card-specific issuer authority and is deliberately not a contract state variable in `execution-interface-descriptor.v1`. The authenticated runtime MUST enforce it before submission, but `ImplicitExEvidenceBoundTransferV2` does not receive or enforce it. A direct caller can therefore exceed a card's signed maximum while satisfying the executor's contract-backed policy. The atomic guard protects the contract-backed policy fields, not every Transaction Evidence constraint. Adding contract enforcement of the maximum requires a new callable ABI, descriptor version/hash, and Transaction Evidence authority. Every other policy field describes contract behavior or routing and MUST be reconciled as described in section 10.

## 7. Lifecycle and executable-registry identity

### 7.1 Authenticated lifecycle record

The lifecycle record MUST be freshly selected from the protected configured lifecycle source and then authenticate and resolve to an execution-permitting operational outcome under the existing lifecycle contracts. Selection MUST be card-only for authority `cardId`, with `manifestId: null`; Transaction Evidence, a caller, or a cached authorization MUST NOT steer selection to a historical manifest. Its exact hash is:

```text
SHA256(
  UTF8("ImplicitEx.CoinCard.AuthenticatedLifecycleRecord.v1")
  || 0x00
  || UTF8(lifecycleCanonicalJson(exactAuthenticatedLifecycleRecord))
)
```

The complete record, including `signature.value`, is hashed only after signature authentication. Registry ID, lifecycle record schema, record ID, record revision, record hash, environment, card ID, and runtime manifest MUST equal authority. Global lifecycle `registryVersion` remains covered by the hash but is not record revision.

The lifecycle record is runtime operational authority, not payment-route authority. The present lifecycle selector cannot publish a successor under the same manifest identity, and its static bundle is rollback-unprotected. Therefore currentness for evidence-bound payment authority MUST be established by the closed, signed `executable-registry-head.v1` and authenticated monotonic source defined by the Phase 1C identity contract, or by an equivalent protected release source that pins the exact lifecycle hash, Registry V2 hash, Transaction Evidence authority hash, and payment epoch. A detached signature or self-asserted flag is insufficient. Until such a source is available, execution fails with `LIFECYCLE_CURRENTNESS_UNAVAILABLE`.

A payment route, policy, or Registry V2 revision change MUST create a new V2 record whose revision is strictly greater than the prior accepted revision, new Transaction Evidence, and a greater authenticated head sequence. Revision values need not be contiguous; reserved, abandoned, or unpublished values may be skipped. It MAY retain the same lifecycle identity and `runtimeManifestId` when runtime code, assets, and operational lifecycle state did not change. A runtime-package change still requires a new manifest and lifecycle identity. The current head selects exactly one authority hash; equal-sequence equivocation or competing current authorities fails closed. Complete canonical head schema, P-256 signature bytes, artifact hash, time, source, sequence, and conjunction rules are in `COIN_CARD_LIFECYCLE_AND_EXECUTABLE_REGISTRY_IDENTITY_CONTRACT_V1.md`.

### 7.2 Executable registry record

Execution requires exact `coin-card-registry-record.v2`. Its hash is:

```text
SHA256(
  UTF8("ImplicitEx.CoinCard.ExecutableRegistryRecord.v2")
  || 0x00
  || UTF8(canonicalJson(exactCoinCardRegistryRecordV2))
)
```

The exact record contains registry schema, registry ID, environment, record ID, revision, card ID, recipient, chain ID, token contract, execution contract, interface ID, descriptor hash, and complete `FeePolicyV1`. Every field MUST equal authority.

Both checks are mandatory:

```text
authority.coinCardRegistryRecordHash == hash(exact V2 record)
AND
authority.execution projection == extract(exact V2 record)
```

A matching hash with disagreeing extracted fields is invalid. Matching extracted fields with a nonmatching hash is also invalid. The verifier MUST NOT combine a hash from one record with execution fields from another record, use a display projection as the hashed record, or allow registry values to override signed values.

`implicitex.coincard.v1` records and the Phase 1B `coin-card-registry-record.v1` scaffold remain legacy/display inputs and fail with `LEGACY_REGISTRY_NOT_EXECUTABLE`. They cannot authoritatively supply every V2 identity and execution leaf, including the governed registry identity, token, executor, descriptor, fee-policy version, fee-cap, bounds, precision, rounding, and treasury facts. Migration requires every V2 leaf to be explicitly re-authorized in a newly governed V2 record and new Transaction Evidence; defaults and client constants are forbidden. Complete rules are in `COIN_CARD_LIFECYCLE_AND_EXECUTABLE_REGISTRY_IDENTITY_CONTRACT_V1.md`.

## 8. Frozen User Intent schema

`FrozenUserIntentV1` MUST contain exactly:

| Field | Type | Meaning |
|---|---|---|
| `intentSchemaVersion` | string | Exact value `frozen-user-intent.v1`. |
| `authorityHash` | hash | Hash of the exact authenticated authority permitting this intent. |
| `cardId` | identifier | MUST equal authority `cardId`. |
| `runtimeManifestId` | hash | MUST equal authority `runtimeManifestId`. |
| `senderAddress` | address | Reviewed and connected sender account. |
| `recipientAddress` | address | MUST equal authority recipient. |
| `chainId` | atomic integer | MUST equal authority chain. |
| `tokenContractAddress` | address | MUST equal authority token. |
| `executionContractAddress` | address | MUST equal authority execution contract. |
| `executionContractInterfaceId` | identifier | MUST equal authority interface. |
| `executionInterfaceDescriptorHash` | hash | MUST equal authority descriptor hash. |
| `amountSentAtomic` | atomic integer | Exact amount intended for the recipient. |
| `feeAmountAtomic` | atomic integer | Exact reviewed fee derived from the reconciled policy. |
| `totalDebitedAtomic` | atomic integer | MUST equal amount plus fee. |

The frozen intent hash uses the frozen-intent domain in section 5.2. It MAY be used as an immutable review/authorization lookup key, but it is not a substitute for wallet approval or issuer signature verification.

Any change to a field creates a new intent. A prior authorization MUST NOT be reused for the new intent.

## 9. Observed execution schemas

### 9.1 Provider binding

The runtime MUST retain the selected EIP-1193 provider as a non-forgeable provider binding, preferably the exact provider object reference held in a private closure or branded immutable capability. A serializable label such as `walletconnect`, `injected`, or a provider UUID is diagnostic only and MUST NOT establish continuity.

The same binding MUST be used for account discovery, chain discovery/switching, contract-state reads, token allowance and balance reads, transaction submission, confirmation, log retrieval, and receipt construction. Late rediscovery through `window.ethereum` is forbidden.

The provider object is intentionally not part of canonical signed JSON.

### 9.2 ObservedExecutionEnvironmentV1

The immutable observation associated with the provider binding MUST contain exactly these serializable facts:

| Field | Type | Meaning |
|---|---|---|
| `observationSchemaVersion` | string | Exact value `observed-execution-environment.v1`. |
| `authorityHash` | hash | Authority being reconciled. |
| `intentHash` | hash | Frozen intent being reconciled. |
| `observationBlockNumber` | atomic integer | Block tag at which all contract-backed state was read. |
| `observationBlockHash` | bytes32 | Hash of that exact observation block. |
| `connectedAccount` | address | Account freshly returned by the bound provider. |
| `chainId` | atomic integer | Chain freshly returned by the bound provider. |
| `tokenContractAddress` | address | Token returned by or verified against the execution contract. |
| `executionContractAddress` | address | Address queried and later called. |
| `executionContractInterfaceId` | identifier | Approved interface established by deterministic deployment/code evidence. |
| `executionInterfaceDescriptorHash` | hash | Exact authenticated descriptor used for getters, calldata, guard, and event decoding. |
| `executionContractCodeHash` | bytes32 | Freshly observed deployed runtime-code hash required by the interface descriptor. |
| `contractPaused` | boolean | Fresh pause state. |
| `feePolicy` | `ObservedFeePolicyV1` | Fresh live policy values. |
| `senderBalanceAtomic` | atomic integer | Fresh token balance. |
| `senderAllowanceAtomic` | atomic integer | Fresh token allowance for the execution contract. |

`ObservedFeePolicyV1` contains exactly `policyVersion`, `feeBasisPoints`, `feeCapEnabled`, `feeCapAtomic`, `minimumTransferAtomic`, `transferPrecisionAtomic`, `roundingRule`, and `feeRecipientAddress`. It deliberately omits the issuer-only `maximumTransferAtomic`.

`feeCapEnabled` is a boolean returned by the authenticated interface. Observed `feeCapAtomic` is always an atomic integer: it MUST be `0` when `feeCapEnabled` is false. Signed authority maps `feeCapAtomic: null` to the one live representation `feeCapEnabled: false, feeCapAtomic: "0"`; a signed atomic cap maps to `feeCapEnabled: true` and that exact observed value.

All contract-backed fields in one observation MUST be read against the same explicit block tag. The verifier MUST confirm that `observationBlockHash` is the hash for `observationBlockNumber` on the observed chain. Reads spread across unpinned `latest` blocks do not form one coherent observation.

Mutable values are read from contract state. Immutable formula semantics such as `policyVersion` and `roundingRule` MAY be derived from the trusted interface descriptor only after the deployed code hash matches that descriptor; they MUST NOT come from registry labels or client defaults.

The interface ID and descriptor hash MUST resolve through the Phase 1B descriptor contract. The descriptor fixes the direct non-proxy/non-delegating execution model, deployed-code identity, transfer function selector and argument encoding, emitted event topic and decoding, state getters, fee formula, and policy-guard mechanism. The observed code hash MUST equal the descriptor at both the pinned preflight block and confirmed settlement block. Merely assigning a familiar interface label to an arbitrary address is insufficient.

### 9.3 ObservedSettlementV1

After confirmation, the runtime MUST decode the descriptor-authenticated `TransferExecuted(address,address,address,uint256,uint256,uint256,bytes32)` event and create an immutable settlement containing exactly:

| Field | Type | Meaning |
|---|---|---|
| `settlementSchemaVersion` | string | Exact value `observed-settlement.v1`. |
| `authorityHash` | hash | Authority used for execution. |
| `intentHash` | hash | Intent consumed for execution. |
| `transactionHash` | transaction hash | Lowercase `0x` plus 64 hex characters; this is not the SHA-256 hash type from section 4.3. |
| `blockNumber` | atomic integer | Confirming block number. |
| `blockHash` | bytes32 | Lowercase `0x` plus 64 hex characters. |
| `logIndex` | atomic integer | Event log index. |
| `eventContractAddress` | address | Contract that emitted the event. |
| `senderAddress` | address | Decoded event sender. |
| `recipientAddress` | address | Decoded event recipient. |
| `tokenContractAddress` | address | Decoded event token. |
| `amountSentAtomic` | atomic integer | Decoded event recipient amount. |
| `feeAmountAtomic` | atomic integer | Decoded event fee amount. |
| `totalDebitedAtomic` | atomic integer | Decoded event total debit. |
| `policyCommitment` | bytes32 | Decoded atomic policy commitment enforced by the executor. |

The receipt MUST be constructed from this confirmed event and transaction metadata, not by replaying requested values. Display token symbols, labels, and decimal formatting are projections added only after the authoritative atomic facts have been decoded and checked.

## 10. Required reconciliation

### 10.1 Authority verification

Before intent authorization, the verifier MUST establish all of the following:

1. exact v1 schema and canonical form;
2. locally recomputed authority hash;
3. trusted issuer key resolution and valid signature;
4. exact `cardId` and verified runtime manifest identity;
5. fresh card-only lifecycle selection from the protected content-authenticated source, exact lifecycle registry, schema, record ID, record revision, record hash, and operational outcome;
6. exact executable-registry V2 namespace, schema, record ID, record revision, and record hash;
7. complete executable-registry extraction equality from section 7.2;
8. a canonical, trusted-key-authenticated, time-valid `executable-registry-head.v1`, authenticated source currentness, protected monotonic sequence, and exact conjunction with lifecycle, Registry V2, and the locally recomputed authority hash;
9. exact descriptor content hash and interface ID; and
10. exact pinned-block deployed runtime-code hash.

### 10.2 Strict live-policy reconciliation

V1 selects the strict policy-snapshot rule:

> A signed contract-backed policy value MUST equal the freshly observed value established from the execution contract and its trusted interface descriptor before authorization. Any mismatch rejects the transfer.

The comparison is:

```text
authority.feePolicy.policyVersion          == observation.feePolicy.policyVersion
authority.feePolicy.feeBasisPoints         == observation.feePolicy.feeBasisPoints
authority.feePolicy.feeCapAtomic is null
  ? observation.feePolicy.feeCapEnabled == false
    AND observation.feePolicy.feeCapAtomic == "0"
  : observation.feePolicy.feeCapEnabled == true
    AND authority.feePolicy.feeCapAtomic == observation.feePolicy.feeCapAtomic
authority.feePolicy.minimumTransferAtomic  == observation.feePolicy.minimumTransferAtomic
authority.feePolicy.transferPrecisionAtomic== observation.feePolicy.transferPrecisionAtomic
authority.feePolicy.roundingRule           == observation.feePolicy.roundingRule
authority.feePolicy.feeRecipientAddress    == observation.feePolicy.feeRecipientAddress
```

`maximumTransferAtomic` is applied directly from authenticated issuer authority. It is not invented from a registry default, replaced by a runtime constant, committed by the executor, or enforced for direct non-Coin-Card callers.

A legitimate on-chain policy change therefore makes existing authority stale and non-executable until new evidence is issued. The runtime MUST NOT prefer the live value, prefer the signed value, warn and continue, or infer policy solely from the contract address/version.

### 10.3 Atomic execution-time policy guard

Preflight equality is necessary but not sufficient. Mutable contract state can change after observation and before transaction inclusion. Therefore the approved execution interface MUST provide one of these properties:

1. every contract-backed execution-policy field is immutable for the deployment; or
2. the transfer call carries the interface-defined signed-policy commitment or exact expected policy values, and the contract atomically compares them to its current state and reverts before any token movement on mismatch.

The atomic guard MUST cover token contract, fee basis points, fee cap semantics, minimum transfer, transfer precision, rounding semantics, and fee-recipient address. The interface descriptor MUST define the deterministic encoding of the guard. A client-only recheck immediately before submission is REQUIRED as a TOCTOU reduction, but it does not replace the on-chain guard.

For `execution-interface-descriptor.v1`, the guard is the exact chain- and execution-contract-bound policy commitment defined by `COIN_CARD_EXECUTION_INTERFACE_DESCRIPTOR_CONTRACT_V1.md`. Local reconstruction, the fresh `currentPolicyCommitment()` result, submitted calldata, contract recomputation, and emitted event commitment MUST all agree.

An interface such as `transferWithFee(recipient, amount)` that reads mutable fee or treasury state but accepts no enforceable expected-policy commitment does not satisfy this contract. It MUST be rejected with `EXECUTION_POLICY_GUARD_UNAVAILABLE`; receipt-time detection after funds have moved is not remediation.

### 10.4 Intent authorization predicate

A frozen intent is eligible only when all of these are true:

- `authorityHash`, `cardId`, `runtimeManifestId`, and `executionInterfaceDescriptorHash` equal the verified authority;
- every route field equals authority;
- `senderAddress` equals the freshly observed connected account;
- observation chain, token, contract address, and interface equal authority and intent;
- the interface descriptor hash and friendly ID match authority, every selector/topic derives correctly, deployed code matches, and its atomic policy guard is present;
- provider continuity remains intact;
- the contract is not paused;
- live policy reconciliation succeeds;
- `amountSentAtomic` is within the inclusive signed minimum and maximum;
- `amountSentAtomic % transferPrecisionAtomic == 0`;
- `feeAmountAtomic` equals the exact fee formula in section 6.2 using reconciled values;
- `totalDebitedAtomic == amountSentAtomic + feeAmountAtomic`;
- balance and allowance each cover `totalDebitedAtomic`; and
- all existing readiness, lifecycle, expiry, one-shot, and TOCTOU guards pass.

Authorization MUST return an immutable execution plan containing the exact provider binding, account, chain, token, execution contract, interface descriptor hash, function selector, policy commitment, policy-guard calldata, transfer calldata fields, amount, fee, total debit, authority hash, and intent hash. The plan MUST be single-use.

After sections 10.1 through 10.3 have succeeded, the section 10.4 predicate MUST use this deterministic fail-closed order:

1. resolve exact descriptor content, validate its schema, content hash, friendly interface ID, deployed-code identity, selector/topic derivations, argument layout, policy guard, reverts, and event semantics;
2. compare frozen-intent and observed card, manifest, route, account, and descriptor references;
3. reject a paused contract;
4. reconcile live policy;
5. validate amount bounds and precision;
6. reconstruct and compare fee;
7. reconstruct and compare total debit with checked arithmetic;
8. require balance greater than or equal to total debit; and
9. require allowance greater than or equal to total debit.

An earlier failure MUST NOT be replaced by a later readiness error. In particular, `CONTRACT_PAUSED`, `INSUFFICIENT_BALANCE`, or `INSUFFICIENT_ALLOWANCE` cannot conceal unavailable, malformed, unauthenticated, or mismatched descriptor/code evidence. Equality at the balance or allowance boundary is sufficient.

### 10.5 Settlement predicate

The confirmed event MUST match the consumed intent and execution plan field-for-field for emitting contract, sender, recipient, token, amount, fee, total debit, and policy commitment. The verifier MUST also independently reconstruct event fee and total debit using section 6.2 and the reconciled policy snapshot. Confirmed-block runtime code MUST still match the authenticated direct-executor descriptor. Missing, duplicate, ambiguous, removed, malformed, or mismatched events reject receipt finalization and MUST NOT be displayed as successful Coin Card execution.

## 11. Deterministic rejection taxonomy

Verifiers MUST fail closed and expose a stable internal code. User-facing text may be less specific, but MUST NOT claim `VERIFIED` or success after any rejection.

| Code | Condition |
|---|---|
| `EVIDENCE_CANONICALIZATION_INVALID` | Malformed canonical JSON, duplicate/unknown/missing field, forbidden number, non-NFC string, or forbidden null/array. |
| `EVIDENCE_DOMAIN_MISMATCH` | Wrong evidence field or hash/signature domain. |
| `EVIDENCE_SCHEMA_UNSUPPORTED` | Unsupported evidence, intent, observation, settlement, canonicalization, or signature version/algorithm. |
| `EVIDENCE_HASH_MISMATCH` | Published authority hash differs from local recomputation. |
| `EVIDENCE_SIGNATURE_INVALID` | Signature or trusted key/issuer resolution fails. |
| `TRANSACTION_EVIDENCE_REQUIRED` | Evidence-bound execution was requested without valid Transaction Evidence; legacy authority cannot substitute. |
| `ISSUER_ID_MISMATCH` | Signed issuer differs from the issuer resolved by trusted key and publication policy. |
| `ENVIRONMENT_MISMATCH` | Signed environment differs from the active, registry, lifecycle, or deployment environment. |
| `ADDRESS_ENCODING_INVALID` | Address is malformed, mixed-case, zero, or otherwise noncanonical. |
| `INTEGER_ENCODING_INVALID` | Integer is not a canonical decimal string or violates its range. |
| `LIFECYCLE_RECORD_UNAUTHENTICATED` | Lifecycle signature/trusted-key authentication was not established. |
| `LIFECYCLE_OUTCOME_NOT_EXECUTABLE` | Selected authenticated lifecycle outcome does not permit execution. |
| `LIFECYCLE_CURRENTNESS_UNAVAILABLE` | Lifecycle content authenticates but no anti-rollback current source or required authenticated head establishes currentness. |
| `LIFECYCLE_AUTHORIZATION_EPOCH_MISMATCH` | Transaction Evidence lifecycle identity differs from the freshly selected current lifecycle record. |
| `LIFECYCLE_AUTHORIZATION_EPOCH_REUSE` | Runtime manifest or lifecycle state changed without advancing exact lifecycle identity. |
| `PAYMENT_AUTHORIZATION_EPOCH_REUSE` | Payment route or policy changed without a strictly greater V2 revision, new authority hash, and greater authenticated head sequence. |
| `LIFECYCLE_REGISTRY_ID_MISMATCH` | Selected lifecycle registry differs from authority. |
| `LIFECYCLE_RECORD_ID_MISMATCH` | Selected lifecycle record ID differs from authority. |
| `LIFECYCLE_RECORD_REVISION_MISMATCH` | Selected lifecycle record revision differs from authority. |
| `LIFECYCLE_RECORD_HASH_MISMATCH` | Exact authenticated lifecycle-record hash differs from authority. |
| `COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED` | Execution record is not exact `coin-card-registry-record.v2`. |
| `COIN_CARD_REGISTRY_ID_MISMATCH` | Executable-registry namespace differs from authority. |
| `COIN_CARD_REGISTRY_RECORD_ID_MISMATCH` | Executable-registry record ID differs from authority. |
| `COIN_CARD_REGISTRY_REVISION_MISMATCH` | Executable-registry revision differs from authority. |
| `COIN_CARD_REGISTRY_RECORD_HASH_MISMATCH` | Exact executable V2 record hash differs from authority. |
| `COIN_CARD_REGISTRY_EXECUTION_FIELD_MISMATCH` | Any V2 extracted execution field differs from authority. |
| `LEGACY_REGISTRY_NOT_EXECUTABLE` | A legacy/display registry record is presented as execution authority. |
| `REGISTRY_MIGRATION_FACT_MISSING` | V2 migration omits or invents an execution-critical fact. |
| `TRANSACTION_EVIDENCE_AUTHORITY_CONFLICT` | The authenticated current source exposes competing current Transaction Evidence authorities. |
| `EXECUTABLE_REGISTRY_HEAD_SCHEMA_INVALID` | Head schema, scalar encoding, timestamp encoding, or signature-envelope shape is invalid. |
| `EXECUTABLE_REGISTRY_HEAD_SIGNATURE_INVALID` | Head signature, algorithm, encoding, domain, key resolution, or authority binding is invalid. |
| `EXECUTABLE_REGISTRY_HEAD_KEY_USAGE_INVALID` | Resolved key lacks exact head-publication usage. |
| `EXECUTABLE_REGISTRY_HEAD_TIME_INVALID` | Head is premature, expired, reversed, or overlong under fixed skew rules. |
| `EXECUTABLE_REGISTRY_HEAD_SOURCE_CURRENTNESS_UNAVAILABLE` | No authenticated source binds the exact head artifact hash and scope. |
| `EXECUTABLE_REGISTRY_HEAD_SEQUENCE_ROLLBACK` | Head sequence is below protected highest-seen state. |
| `EXECUTABLE_REGISTRY_HEAD_SEQUENCE_EQUIVOCATION` | One head sequence is associated with different authenticated artifact hashes. |
| `EXECUTABLE_REGISTRY_HEAD_MISMATCH` | Authenticated head disagrees with lifecycle, Registry V2, or Transaction Evidence. |
| `CARD_ID_MISMATCH` | Card identity differs across authority, registry, lifecycle, intent, or active card. |
| `RUNTIME_MANIFEST_MISMATCH` | Verified runtime manifest/artifact identity differs from authority or intent. |
| `LIFECYCLE_SCHEMA_MISMATCH` | Selected lifecycle schema differs from authority. |
| `RECIPIENT_MISMATCH` | Registry, intent, plan, or event recipient differs from authority. |
| `CHAIN_ID_MISMATCH` | Intent or provider-observed EIP-155 chain differs from authority. |
| `TOKEN_CONTRACT_MISMATCH` | Registry, observation, intent, or plan token differs from authority/contract state. |
| `EXECUTION_CONTRACT_MISMATCH` | Registry, observation, plan, call target, or event emitter differs from authority. |
| `EXECUTION_INTERFACE_DESCRIPTOR_UNAVAILABLE` | The signed descriptor hash cannot be resolved to exact content. |
| `EXECUTION_INTERFACE_DESCRIPTOR_SCHEMA_INVALID` | Resolved descriptor content is malformed, noncanonical, or unsupported. |
| `EXECUTION_CONTRACT_INTERFACE_MISMATCH` | Friendly interface identity differs across authority, intent, observation, or the authenticated descriptor. |
| `EXECUTION_INTERFACE_DESCRIPTOR_HASH_MISMATCH` | Resolved descriptor content differs from signed authority, intent, or observation. |
| `EXECUTION_CONTRACT_CODE_HASH_MISMATCH` | Preflight or settlement-block deployed runtime code differs from the authenticated descriptor. |
| `EXECUTION_FUNCTION_SELECTOR_MISMATCH` | A transfer or getter selector differs from the Keccak-256 derivation of its canonical signature. |
| `EXECUTION_EVENT_TOPIC_MISMATCH` | The settlement event topic differs from the Keccak-256 derivation of its canonical signature. |
| `EXECUTION_POLICY_COMMITMENT_MISMATCH` | Locally constructed, observed, submitted, contract-recomputed, or emitted policy commitment differs. |
| `EXECUTION_POLICY_GUARD_UNAVAILABLE` | The interface cannot atomically enforce the signed contract-backed policy at execution time. |
| `CONTRACT_PAUSED` | Fresh pinned-block observation reports that the execution contract is paused. |
| `FEE_POLICY_MISMATCH` | Registry policy or freshly observed contract-backed policy differs from authority. |
| `AMOUNT_POLICY_VIOLATION` | Amount is outside signed bounds or violates signed precision. |
| `FEE_CALCULATION_MISMATCH` | Frozen or emitted fee differs from exact reconciled calculation. |
| `TOTAL_DEBIT_MISMATCH` | Frozen or emitted total differs from exact amount plus fee. |
| `INSUFFICIENT_BALANCE` | Fresh sender token balance is below exact total debit. |
| `INSUFFICIENT_ALLOWANCE` | Fresh sender allowance to the authenticated executor is below exact total debit. |
| `SENDER_ACCOUNT_MISMATCH` | Frozen sender, fresh account, submitting account, or event sender differs. |
| `PROVIDER_CONTINUITY_MISMATCH` | Any execution phase uses a different or rediscovered provider binding. |
| `EXECUTION_EVENT_MISMATCH` | Confirmed event is missing, ambiguous, removed, malformed, or otherwise differs from the consumed plan. |
| `CROSS_AUTHORITY_LEGACY_SCHEMA_UNSUPPORTED` | A payment-bearing legacy envelope cannot produce the required authenticated compatibility projection. |
| `CROSS_AUTHORITY_RUNTIME_MANIFEST_MISMATCH` | Legacy `manifestId` differs from Transaction Evidence `runtimeManifestId`. |
| `CROSS_AUTHORITY_CARD_ID_MISMATCH` | Legacy and Transaction Evidence card identities differ. |
| `CROSS_AUTHORITY_ISSUER_MISMATCH` | Independently authenticated legacy and Transaction Evidence issuer identities differ. |
| `CROSS_AUTHORITY_ENVIRONMENT_MISMATCH` | Independently authenticated legacy and Transaction Evidence environments differ. |
| `CROSS_AUTHORITY_RECIPIENT_MISMATCH` | Legacy recipient differs from Transaction Evidence recipient. |
| `CROSS_AUTHORITY_CHAIN_MISMATCH` | Legacy chain namespace or chain ID differs from Transaction Evidence. |
| `CROSS_AUTHORITY_TOKEN_MISMATCH` | Legacy token standard/address differs from Transaction Evidence token route. |
| `CROSS_AUTHORITY_AMOUNT_POLICY_MISMATCH` | Legacy amount restriction is malformed, precision-invalid, empty, or would enlarge Transaction Evidence authority. |

When more than one condition applies, implementations SHOULD evaluate in the order defined in sections 10.1 through 10.5. Security does not depend on exposing a particular first error, but tests and telemetry MUST NOT use a later error to conceal an earlier trust failure.

## 12. Required deterministic vectors

The normative fixture file is `coin-card.transaction-evidence.fixtures.v1.json`. Focused contract tests MUST cover:

- the canonical positive authority and registry record;
- the authenticated lifecycle record identity and exact signed-record hash;
- distinction between lifecycle registry version and lifecycle record revision;
- fresh card-only lifecycle selection, stale/superseded rejection, and proof that the existing lineage cannot advance under one manifest ID;
- canonical head signed bytes, valid P-256 signature and artifact hash, one-field mutations, time/skew boundaries, wrong domain/key usage/key, and malformed schema;
- authenticated-source binding, sequence rollback/equivocation, and complete head equality with lifecycle, V2, and Transaction Evidence;
- valid payment-route advancement under an unchanged runtime manifest and rejection when its head/payment epoch does not advance;
- executable-registry V2 ID, record ID, revision, hash, descriptor, and extracted-field equality;
- rejection of both legacy registry schemas and every missing migration fact;
- a property-order variant producing identical canonical JSON and hashes;
- a mutation for every critical authority field;
- nested mutations for every fee-policy field;
- a registry-record mutation that changes the hash;
- registry hash/extracted-field disagreements;
- invalid address forms;
- invalid integer forms, including a JavaScript number rejection constructed by the test;
- unsupported schema version;
- a stale signed fee policy against changed observed contract state;
- a matching legacy compatibility projection;
- absence of legacy payment fields under a compatible payment-free runtime schema;
- absence of Transaction Evidence on an evidence-bound path;
- one-field legacy conflicts for manifest, card, issuer, environment, recipient, chain, token, and amount policy;
- valid `MINIMUM_AMOUNT` and `BOUNDED_AMOUNT` narrowing with the expected effective intervals;
- legacy lower-bound enlargement, upper-bound enlargement, precision-invalid bounds, and an empty interval;
- frozen amounts below, above, or precision-invalid within the effective legacy-authority intersection;
- unresolved and unsupported execution-interface descriptors;
- descriptor-hash mutations across authority, intent, and observation;
- independently derived selector and event-topic mutations;
- a paused executor, insufficient balance, insufficient allowance, and exact balance/allowance boundary acceptance;
- deterministic precedence proving descriptor/code trust failures precede readiness, paused precedes policy, policy precedes funding, and balance precedes allowance;
- token and policy-commitment settlement mutations; and
- route, sender, amount, fee, total-debit, and settlement mismatches.

The reference test implementation is specification scaffolding only. Production runtime code MUST implement the same contract independently and MUST NOT import test helpers or fixture trust decisions.

## 13. Phase 1D conformance closure

The Phase 1D matrix is a specification-level closure gate, not a runtime certification. Its named predicates and normative deterministic vectors are:

| Predicate | Required vector | Stable code |
|---|---|---|
| Paused executor | Fresh observation changes `contractPaused` to true. | `CONTRACT_PAUSED` |
| Balance readiness | Balance is one atomic unit below total debit; equality also passes. | `INSUFFICIENT_BALANCE` |
| Allowance readiness | Allowance is one atomic unit below total debit; equality also passes. | `INSUFFICIENT_ALLOWANCE` |
| Descriptor resolution | Exact content is unavailable. | `EXECUTION_INTERFACE_DESCRIPTOR_UNAVAILABLE` |
| Descriptor schema | Descriptor schema version is unsupported. | `EXECUTION_INTERFACE_DESCRIPTOR_SCHEMA_INVALID` |
| Descriptor hash | Authority descriptor hash differs from resolved content. | `EXECUTION_INTERFACE_DESCRIPTOR_HASH_MISMATCH` |
| Selector derivation | Transfer selector differs by one bit from canonical derivation. | `EXECUTION_FUNCTION_SELECTOR_MISMATCH` |
| Event-topic derivation | Event topic differs by one bit from canonical derivation. | `EXECUTION_EVENT_TOPIC_MISMATCH` |
| Deployed-code identity | Pinned observation code hash differs from descriptor. | `EXECUTION_CONTRACT_CODE_HASH_MISMATCH` |
| Cross-authority conflict | Authenticated legacy recipient differs from Transaction Evidence. | `CROSS_AUTHORITY_RECIPIENT_MISMATCH` |
| Lifecycle schema | Lifecycle registry schema differs from authenticated authority/context. | `LIFECYCLE_SCHEMA_MISMATCH` |
| Executable-registry schema | Record is not exact `coin-card-registry-record.v2`. | `COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED` |

The fixture's `phase1DConformance.matrix` MUST reference exactly those executable vectors rather than merely listing prose labels. Each referenced vector MUST also run in its owning focused suite. Phase 1D conformance is green only when the Transaction Evidence, execution-interface descriptor, Phase 1C identity/currentness, lifecycle/canonicalization, execution-authorization, and provider-continuity focused suites all retain their established results, and every red test is classified as introduced, pre-existing expected, or unrelated.

This closure does not promote either Proposed specification automatically. Promotion requires a separate approval after review of the conformance results. Runtime implementation later MUST independently reproduce every predicate and ordering rule without importing these test-local reference helpers or treating fixture values as production trust.

## 14. Phase 1 non-goals

This contract does not:

- modify `card.js`, wallet code, `IX_EXECUTION`, or lifecycle runtime modules;
- claim that the current Coin Card implements this evidence flow;
- repair or regenerate the committed production runtime manifest;
- sign or re-sign any evidence;
- change a deployment or contract version;
- populate or migrate a production executable registry;
- weaken, skip, or rewrite an existing production-manifest trust test; or
- turn unfinished claim/backend surfaces into production functionality.

Those are later, separately reviewed increments.
