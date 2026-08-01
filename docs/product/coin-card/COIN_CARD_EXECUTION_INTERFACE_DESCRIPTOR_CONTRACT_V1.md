# Coin Card Execution Interface Descriptor Contract v1

## Status

**Sealed — normative execution-interface authority in the three-contract evidence-authority unit; not implemented.**

This document defines `execution-interface-descriptor.v1`, the content-addressed contract between Transaction Evidence and a future evidence-bound EVM executor. It specifies interface identity, deployed runtime-code identity, transfer calldata, atomic policy commitment, required state reads, revert behavior, event decoding, and settlement reconciliation.

This contract, `COIN_CARD_TRANSACTION_EVIDENCE_CONTRACT_V1.md`, and `COIN_CARD_LIFECYCLE_AND_EXECUTABLE_REGISTRY_IDENTITY_CONTRACT_V1.md` form one inseparable sealed authority unit. A later status or version change that affects their shared trust boundary MUST update all affected members and governance metadata atomically. Their fixtures and focused tests substantiate conformance but are not normative authorities.

This increment does not implement or deploy `ImplicitExEvidenceBoundTransferV2`. It does not modify the Coin Card runtime, Solidity, manifests, lifecycle records, registry schemas, or production wiring. The deterministic code hash and addresses in the fixture are specification vectors, not claims about a live deployment.

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, and **MAY** are normative.

## 1. Authority and authentication

The descriptor owns execution-interface semantics. It is authoritative for:

- the exact deployed EVM runtime-code hash;
- the direct, non-proxy execution model whose runtime code contains the executing logic;
- callable and getter ABI signatures;
- function and error selectors;
- argument types, order, and sources;
- the atomic live-policy commitment;
- event topic and log decoding; and
- settlement extraction rules.

It is not authoritative for a card recipient, user amount, sender, chain, execution-contract address, or fee-policy values. Those values come from Transaction Evidence, frozen intent, and fresh observation.

The exact descriptor is authenticated by content-address inclusion in signed Transaction Evidence:

```text
descriptorHash = SHA256(
  UTF8("ImplicitEx.CoinCard.ExecutionInterfaceDescriptor.v1")
  || 0x00
  || UTF8(canonicalJson(exactDescriptor))
)

authority.executionInterfaceDescriptorHash == descriptorHash
authority.executionContractInterfaceId      == exactDescriptor.interfaceId
```

The canonical textual hash is lowercase `sha256:` followed by 64 lowercase hexadecimal characters. A separately valid descriptor signature, catalog label, URL, interface ID, or runtime-manifest entry MUST NOT substitute for the signed hash equality above. A publication system MAY add independent authentication, but it cannot weaken this rule.

The verifier MUST authenticate Transaction Evidence before treating the referenced descriptor as authority. It MUST then hash the complete descriptor, without dropping unknown fields, and compare the result in constant time where practical. Missing content fails with `EXECUTION_INTERFACE_DESCRIPTOR_UNAVAILABLE`; malformed or unsupported content fails with `EXECUTION_INTERFACE_DESCRIPTOR_SCHEMA_INVALID`; hash disagreement fails with `EXECUTION_INTERFACE_DESCRIPTOR_HASH_MISMATCH`.

## 2. Canonical serialization

Descriptors use `coin-card-canonical-json.v1` and UTF-8 without a byte-order mark:

- object keys are serialized in ascending Unicode code-point order;
- arrays occur only where this contract declares them and their order is normative;
- transfer inputs, policy-commitment fields, getter definitions, event inputs, and revert definitions MUST remain in their declared order;
- strings are NFC-normalized Unicode scalar strings;
- duplicate keys, accessors, symbols, functions, cycles, sparse arrays, undeclared fields, and noncanonical strings are invalid;
- native JSON numbers are forbidden; and
- omitted fields and `null` are forbidden in the v1 descriptor.

Property insertion order does not affect canonical output. Array order always does. A later schema MUST use a new `descriptorSchemaVersion` and a new domain.

## 3. Exact descriptor schema

`ExecutionInterfaceDescriptorV1` contains exactly:

| Field | Type | Requirement |
|---|---|---|
| `descriptorDomain` | string | Exact value `ImplicitEx.CoinCard.ExecutionInterfaceDescriptor`. |
| `descriptorSchemaVersion` | string | Exact value `execution-interface-descriptor.v1`. |
| `interfaceId` | identifier | Exact value `implicitex-evidence-bound-transfer.v1`. Friendly compatibility name; never sufficient without the descriptor hash. |
| `contractGeneration` | identifier | Exact value `ImplicitExEvidenceBoundTransferV2`. |
| `abiEncoding` | enum | Exact value `EVM_ABI_V2`. |
| `executionModel` | enum | Exact value `DIRECT_NON_PROXY_NON_DELEGATING`. |
| `deployedRuntimeCodeHashAlgorithm` | enum | Exact value `KECCAK256`. |
| `deployedRuntimeCodeHash` | bytes32 | Keccak-256 of exact deployed runtime bytecode. |
| `transferFunction` | object | Exact transfer call definition from section 4. |
| `policyCommitment` | object | Exact atomic guard definition from section 5. |
| `stateReads` | array | Ordered exact getter definitions from section 6. |
| `transferEvent` | object | Exact event definition from section 8. |
| `reverts` | array | Ordered exact required revert definitions from section 7. |

All EVM bytes and selectors are lowercase `0x` hexadecimal. An EVM address is lowercase `0x` plus 40 hexadecimal characters and cannot be zero. A selector is 4 bytes. A topic or code hash is 32 bytes.

The deployed code hash is:

```text
KECCAK256(runtimeCodeBytes)
```

where `runtimeCodeBytes` is the nonempty result of `eth_getCode(executionContractAddress, blockTag)`, decoded from hexadecimal exactly. It is not creation bytecode, compiler metadata supplied separately, an explorer-reported source hash, SHA3-256, or the SHA-256 descriptor hash.

The same comparison MUST be made against a pinned preflight block and the confirmed settlement block. A missing code body or mismatch fails with `EXECUTION_CONTRACT_CODE_HASH_MISMATCH`.

### 3.1 Direct deployed identity

`ImplicitExEvidenceBoundTransferV2` MUST be a direct, non-proxy, non-delegating executor. The nonempty runtime code returned for the exact Transaction Evidence `executionContractAddress` MUST itself contain the policy guard, fee calculation, token-transfer orchestration, and event-emission logic described by this descriptor.

The executor MUST NOT be a transparent, UUPS, beacon, minimal, diamond, metamorphic, or other proxy; MUST NOT use `DELEGATECALL` or `CALLCODE`; and MUST NOT obtain execution-critical policy or transfer logic from a mutable implementation, facet, beacon, module, or helper address. `SELFDESTRUCT`-based or equivalent same-address code replacement is noncompliant. Ordinary external calls to the descriptor-bound token do not make the executor a proxy, but the executor remains responsible for all route, policy, arithmetic, movement-ordering, and settlement invariants in this contract.

Therefore `KECCAK256(eth_getCode(executionContractAddress, blockTag))` identifies the executing executor logic, not merely a dispatch shell. Any upgrade or logic change requires a new execution-contract address, new deployed runtime-code hash, new descriptor hash, and new Transaction Evidence authority. Reusing the old address or descriptor for changed logic is forbidden. A descriptor whose `executionModel` is missing or differs from `DIRECT_NON_PROXY_NON_DELEGATING` fails with `EXECUTION_INTERFACE_DESCRIPTOR_SCHEMA_INVALID`.

## 4. Transfer function

The descriptor pins:

```solidity
function transferWithEvidence(
    address recipient,
    uint256 amountSentAtomic,
    bytes32 expectedPolicyCommitment
) external;
```

The exact canonical signature is:

```text
transferWithEvidence(address,uint256,bytes32)
```

Its selector is the first four bytes of `KECCAK256(UTF8(canonicalSignature))`. The fixture pins `0xb54352eb`.

`transferFunction` contains exactly:

| Field | Type | Requirement |
|---|---|---|
| `name` | string | `transferWithEvidence`. |
| `canonicalSignature` | string | Exact signature above. |
| `selector` | bytes4 | Derived selector above. |
| `stateMutability` | enum | `nonpayable`. Native value MUST be zero. |
| `inputs` | array | Exactly the three definitions below in order. |
| `outputs` | array | Exact empty array. |

Each input contains exactly `name`, `type`, and `source`:

| Position | Name | ABI type | Source |
|---:|---|---|---|
| 0 | `recipient` | `address` | `frozenIntent.recipientAddress` |
| 1 | `amountSentAtomic` | `uint256` | `frozenIntent.amountSentAtomic` |
| 2 | `expectedPolicyCommitment` | `bytes32` | `reconciledPolicyCommitment` |

Calldata is `selector || ABI_ENCODE(inputs)`. Packed encoding is forbidden. Changing input order, widening or narrowing a declared type, adding a boolean compatibility flag, or using a different selector is an interface mismatch.

The call target MUST equal `authority.executionContractAddress`, the provider chain MUST equal `authority.chainId`, and the first two arguments MUST equal frozen intent. The third MUST equal both the descriptor-derived commitment from authenticated/reconciled values and the fresh `currentPolicyCommitment()` getter result.

An interface such as `transferWithFee(address,uint256)` is legacy and MUST be rejected with `EXECUTION_POLICY_GUARD_UNAVAILABLE` on the evidence-bound path because it cannot carry the expected policy commitment.

## 5. Atomic policy commitment

### 5.1 Construction

The exact policy domain text is:

```text
ImplicitExEvidenceBoundTransferV2.PolicyCommitment.v1
```

`domainHash`, `policyVersionHash`, and `roundingRuleHash` are Keccak-256 of the UTF-8 bytes of their respective source strings. The policy commitment is:

```solidity
keccak256(abi.encode(
    bytes32 domainHash,
    uint256 chainId,
    address executionContractAddress,
    address tokenContractAddress,
    bytes32 policyVersionHash,
    uint256 feeBasisPoints,
    bool feeCapEnabled,
    uint256 feeCapAtomic,
    uint256 minimumTransferAtomic,
    uint256 transferPrecisionAtomic,
    bytes32 roundingRuleHash,
    address feeRecipientAddress
))
```

The `policyCommitment.fields` array contains those twelve field definitions in exactly that order. Each definition contains exactly `name`, `type`, and `source`.

The source values are:

| Field | Source |
|---|---|
| `domainHash` | `keccak256(UTF8(policyCommitment.domainText))` |
| `chainId` | authenticated authority and fresh provider observation |
| `executionContractAddress` | authenticated authority and actual call target |
| `tokenContractAddress` | authenticated authority and fresh `token()` result |
| `policyVersionHash` | `keccak256(UTF8(authority.feePolicy.policyVersion))` |
| `feeBasisPoints` | authenticated authority and fresh getter result |
| `feeCapEnabled` | `false` when signed `feeCapAtomic` is `null`; otherwise `true` |
| `feeCapAtomic` | `0` when `feeCapEnabled` is false; otherwise signed and observed atomic cap |
| `minimumTransferAtomic` | authenticated authority and fresh getter result |
| `transferPrecisionAtomic` | authenticated authority and fresh getter result |
| `roundingRuleHash` | `keccak256(UTF8(authority.feePolicy.roundingRule))` |
| `feeRecipientAddress` | authenticated authority and fresh getter result |

If `feeCapEnabled` is false, live `feeCapAtomic()` MUST be zero. This prevents two encodings of uncapped policy. `maximumTransferAtomic` is issuer-only authority and is deliberately not part of the live contract policy commitment; it remains mandatory in frozen-intent authorization.

The atomic commitment guards contract-backed policy only. `maximumTransferAtomic` is card-specific issuer authority enforced by the authenticated runtime before submission; `ImplicitExEvidenceBoundTransferV2` does not receive or enforce it. Consequently, a direct caller that does not use an authenticated Coin Card runtime can exceed a card's signed maximum if the call still satisfies the executor's minimum, precision, live fee policy, and other contract conditions. “Evidence-bound” describes the conjunction of authenticated runtime authorization and the atomic executor guard, not independent on-chain enforcement of every Transaction Evidence constraint. Adding a contract-enforced maximum requires a new callable ABI, descriptor version/hash, and Transaction Evidence authority.

`abi.encode`, not `abi.encodePacked`, is REQUIRED. Values are encoded as the declared ABI types. The chain ID and execution-contract address make the commitment unusable as a valid guard on another chain or executor. Mutation of either MUST change the commitment.

### 5.2 Contract enforcement

At transfer entry, `ImplicitExEvidenceBoundTransferV2` MUST recompute the actual commitment from `block.chainid`, `address(this)`, immutable token identity, immutable policy-semantic constants, and current contract state. Before any token movement, it MUST compare actual to `expectedPolicyCommitment` and revert on disagreement:

```solidity
error PolicyCommitmentMismatch(bytes32 expected, bytes32 actual);
```

The emitted event MUST contain the same actual commitment. A browser-side check without this atomic contract comparison is not compliant.

The executor MUST capture every live policy value into one local execution snapshot before comparison or external interaction. Fee calculation, fee destination, token calls, and emitted policy commitment MUST use that exact snapshot; the implementation MUST NOT reread mutable policy after the first external token call. Every function capable of mutating committed policy MUST share the execution reentrancy lock, or the policy MUST be immutable, so a token callback cannot change policy during an in-progress transfer.

### 5.3 Executable fee calculation

The sole v1 rounding rule is `FLOOR_BPS_THEN_CAP`, with the fixed basis-point denominator `10_000`. For the `amountSentAtomic`, `feeBasisPoints`, `feeCapEnabled`, and `feeCapAtomic` captured in the same local execution snapshot used for the policy commitment:

```text
BPS_DENOMINATOR = 10000

require 0 <= feeBasisPoints <= BPS_DENOMINATOR

rawFee = mulDivFloor(
  amountSentAtomic,
  feeBasisPoints,
  BPS_DENOMINATOR
)

feeAmount = feeCapEnabled
  ? min(rawFee, feeCapAtomic)
  : rawFee

require amountSentAtomic <= UINT256_MAX - feeAmount
totalDebited = amountSentAtomic + feeAmount
```

`mulDivFloor(x, y, d)` means the exact mathematical value `floor(x * y / d)` computed with a full 512-bit intermediate product or an equivalent full-precision algorithm. An implementation MUST NOT perform an overflowing 256-bit `x * y` before division. With `feeBasisPoints <= 10_000`, `rawFee` fits in `uint256`; failure of the full-precision operation MUST revert before token movement.

The floor operation occurs before cap application. A zero fee is valid when basis points are zero, an enabled cap is zero, or exact division floors to zero. An uncapped policy has `feeCapEnabled == false` and `feeCapAtomic == 0`; its cap value is not consulted. A basis-point value greater than `10_000` is invalid policy: construction or mutation MUST revert as `FeeBasisPointsTooHigh(attemptedBasisPoints, 10000)`, and preflight observation of such state MUST fail with `FEE_POLICY_MISMATCH`. Addition overflow MUST revert as `TotalDebitOverflow(amountSentAtomic, feeAmount)` before any token movement or success event.

The transfer event MUST emit the `feeAmount` and `totalDebited` calculated above. Settlement verification MUST independently reconstruct both values from the decoded `amountSent`, authenticated rounding semantics, and the same reconciled policy snapshot. Matching frozen intent alone is insufficient: a reconstructed fee mismatch fails with `FEE_CALCULATION_MISMATCH`, and a reconstructed total mismatch fails with `TOTAL_DEBIT_MISMATCH`.

## 6. Required state reads

`stateReads` is an ordered array of objects containing exactly `name`, `canonicalSignature`, `selector`, `outputs`, and `source`. Each `outputs` array contains ABI type strings in return order.

The v1 descriptor requires, in this order:

| Getter | Output | Source meaning |
|---|---|---|
| `token()` | `address` | Execution token. |
| `feeRecipient()` | `address` | Fee destination. |
| `feeBasisPoints()` | `uint256` | Current basis points. |
| `feeCapEnabled()` | `bool` | Current cap semantics. |
| `feeCapAtomic()` | `uint256` | Current cap value; zero when disabled. |
| `minimumTransferAtomic()` | `uint256` | Current minimum. |
| `transferPrecisionAtomic()` | `uint256` | Current precision. |
| `paused()` | `bool` | Current pause state. |
| `currentPolicyCommitment()` | `bytes32` | Contract recomputation for the current chain, address, immutable facts, and state. |

All reads used by one authorization MUST use the same explicit block tag. The returned commitment MUST equal a local reconstruction from the other results and authenticated immutable semantics. Getter selectors MUST be derived from their canonical signatures and match the descriptor.

## 7. Required reverts and ordering

The descriptor pins these required custom-error signatures and selectors:

| Error | Condition |
|---|---|
| `PolicyCommitmentMismatch(bytes32,bytes32)` | Expected commitment differs from current contract policy. |
| `RecipientZeroAddress()` | Recipient is zero. |
| `InvalidRecipient(address)` | Recipient is the executor or transfer-token contract. |
| `FeeBasisPointsTooHigh(uint256,uint256)` | Attempted basis points exceed the fixed maximum 10,000. |
| `AmountBelowMinimum(uint256,uint256)` | Amount is below current minimum. |
| `InvalidTransferPrecision(uint256,uint256)` | Amount is not an exact multiple of current precision. |
| `TotalDebitOverflow(uint256,uint256)` | Amount plus calculated fee does not fit in `uint256`. |
| `EnforcedPause()` | Contract is paused. |
| `ReentrancyGuardReentrantCall()` | Reentrant call attempted. |

Each `reverts` entry contains exactly `name`, `canonicalSignature`, `selector`, and `conditionCode`. Selectors MUST be derived from canonical signatures.

Pause and reentrancy modifiers MAY run before the function body. Within the body, the policy-commitment comparison MUST occur before recipient validation, amount validation, fee calculation, or token calls. All listed business validation and fee calculation MUST complete from the committed local policy snapshot before the first token movement. Any ERC-20 failure or arithmetic panic MUST revert the complete transaction; no success event may exist for a reverted transaction.

Revert-data text is diagnostic only. Authorization MUST be based on preflight predicates and confirmed settlement, not on assuming that a wallet will preserve revert data.

## 8. Transfer event and decoding

The descriptor pins:

```solidity
event TransferExecuted(
    address indexed sender,
    address indexed recipient,
    address indexed token,
    uint256 amountSent,
    uint256 feeAmount,
    uint256 totalDebited,
    bytes32 policyCommitment
);
```

The canonical signature is:

```text
TransferExecuted(address,address,address,uint256,uint256,uint256,bytes32)
```

`topic0` is the full Keccak-256 signature hash. The `transferEvent.inputs` array contains exactly `name`, `type`, `indexed`, and `settlementField` in ABI order.

Log decoding is exact:

| Log location | Value | Settlement field |
|---|---|---|
| `topics[0]` | descriptor `topic0` | event identity |
| `topics[1]` | indexed address | `senderAddress` |
| `topics[2]` | indexed address | `recipientAddress` |
| `topics[3]` | indexed address | `tokenContractAddress` |
| data word 0 | `uint256` | `amountSentAtomic` |
| data word 1 | `uint256` | `feeAmountAtomic` |
| data word 2 | `uint256` | `totalDebitedAtomic` |
| data word 3 | `bytes32` | `policyCommitment` |

Indexed addresses MUST have twelve zero bytes followed by the canonical 20-byte address. Noncanonical topic padding is invalid. Data length MUST be exactly 128 bytes. The receipt MUST contain exactly one non-removed matching log emitted by the authenticated execution-contract address.

## 9. Settlement reconciliation

The settlement projection adds `tokenContractAddress` and `policyCommitment` to the Transaction Evidence settlement object. A confirmed execution is valid only when:

```text
receipt.status                         == 1
confirmed provider/transaction chainId == authority.chainId
receipt.to                             == authority.executionContractAddress
confirmed code hash                    == descriptor.deployedRuntimeCodeHash
log.address                            == authority.executionContractAddress
decoded sender                         == frozen intent sender
decoded recipient                      == frozen intent recipient
decoded token                          == authority token
decoded amountSent                     == frozen intent amount
decoded feeAmount                      == independently reconstructed fee
decoded feeAmount                      == frozen intent fee
decoded totalDebited                   == independently reconstructed amount plus fee
decoded totalDebited                   == frozen intent total debit
decoded policyCommitment               == submitted expected commitment
decoded policyCommitment               == locally reconciled commitment
```

The interface ID and descriptor hash must already have matched authority before decoding. Requested values, registry labels, or browser state MUST NOT fill missing event fields. A topic mismatch, malformed log, missing log, duplicate matching log, removed log, or field mismatch fails with `EXECUTION_EVENT_MISMATCH` unless a more specific route/policy mismatch applies.

## 10. Deterministic rejection taxonomy

| Code | Condition |
|---|---|
| `EXECUTION_INTERFACE_DESCRIPTOR_UNAVAILABLE` | Signed descriptor hash cannot be resolved to exact content. |
| `EXECUTION_INTERFACE_DESCRIPTOR_SCHEMA_INVALID` | Descriptor is malformed, noncanonical, or unsupported. |
| `EXECUTION_INTERFACE_DESCRIPTOR_HASH_MISMATCH` | Recomputed content hash differs from signed authority. |
| `EXECUTION_INTERFACE_ID_MISMATCH` | Descriptor friendly ID differs from signed authority. |
| `EXECUTION_CONTRACT_CODE_HASH_MISMATCH` | Pinned preflight or settlement-block runtime code differs from descriptor. |
| `EXECUTION_FUNCTION_SELECTOR_MISMATCH` | Transfer or getter selector differs from its canonical signature. |
| `EXECUTION_ARGUMENT_LAYOUT_MISMATCH` | Transfer or policy arguments differ in type, order, source, or encoding. |
| `EXECUTION_POLICY_COMMITMENT_MISMATCH` | Local, observed, submitted, contract-recomputed, or emitted commitment differs. |
| `EXECUTION_POLICY_GUARD_UNAVAILABLE` | Callable interface does not atomically compare expected and current policy before movement. |
| `FEE_POLICY_MISMATCH` | Observed basis points exceed 10,000 or other live fee semantics violate the authenticated policy. |
| `FEE_CALCULATION_MISMATCH` | Frozen or emitted fee differs from independent `FLOOR_BPS_THEN_CAP` reconstruction. |
| `TOTAL_DEBIT_MISMATCH` | Frozen or emitted total differs from the checked amount-plus-fee sum. |
| `EXECUTION_REVERT_DESCRIPTOR_MISMATCH` | Required custom-error signature, selector, condition, or ordering is absent or altered. |
| `EXECUTION_EVENT_TOPIC_MISMATCH` | Event topic differs from its canonical signature. |
| `EXECUTION_EVENT_DECODING_INVALID` | Log topic count, padding, data length, or ABI decoding is invalid. |
| `EXECUTION_EVENT_MISMATCH` | Decoded settlement differs from authority, frozen intent, submitted commitment, or receipt metadata. |

Descriptor failures MUST be evaluated before constructing calldata or decoding a log under that descriptor. Implementations MUST NOT accept literal selector or topic fields without independently deriving them from canonical signatures.

Descriptor verification order is deterministic: resolve exact content, validate the closed schema and canonical form, recompute and compare its authenticated content hash, compare the friendly interface ID, compare pinned-block deployed code, derive every function/error selector and event topic, then validate argument, guard, revert, and decoding semantics. Failure to resolve content is `EXECUTION_INTERFACE_DESCRIPTOR_UNAVAILABLE`; an object that resolves but is malformed or unsupported is `EXECUTION_INTERFACE_DESCRIPTOR_SCHEMA_INVALID`. A later hash, code, selector, or topic error MUST NOT mask either earlier condition.

## 11. Required deterministic vectors

The normative fixture is `coin-card.execution-interface-descriptor.fixtures.v1.json`. Focused tests MUST pin:

- canonical descriptor JSON and domain-separated SHA-256 descriptor hash;
- fail-closed exact-content resolution when the authenticated descriptor is unavailable;
- property-order independence and array-order sensitivity;
- every transfer/getter/error selector derived from Keccak-256 canonical signatures;
- event topic derivation;
- policy-domain, policy-version, and rounding-rule Keccak-256 hashes;
- exact `abi.encode` policy commitment;
- mutations of chain ID and execution-contract address producing different commitments;
- exact transfer calldata and argument order;
- direct non-proxy/non-delegating execution identity and rejection of another execution model;
- boundary fee vectors covering zero fee, floor-before-cap, exact cap, binding cap, uncapped fees, zero cap, full-precision multiplication, basis points above 10,000, and total-debit overflow;
- one positive event log and decoded settlement;
- wrong descriptor domain/schema/hash, code hash, selector, argument order, policy field order, revert selector, and event topic;
- malformed topic padding, data length, missing/duplicate/removed log, and settlement mismatch; and
- explicit rejection of the legacy `transferWithFee(address,uint256)` interface as lacking the atomic policy guard.

The fixture code hash and addresses are synthetic. Passing these vectors does not prove that a contract has been implemented, audited, or deployed.

## 12. Specification non-goals

This contract does not:

- implement `ImplicitExEvidenceBoundTransferV2`;
- claim that `ImplicitExTransferV1` satisfies the descriptor;
- publish a production descriptor or deployment record;
- change Transaction Evidence lifecycle or registry identity rules;
- implement the paused, balance, or allowance predicates defined by Transaction Evidence;
- modify runtime execution or receipt code;
- regenerate or sign a production manifest; or
- deploy or verify Solidity.
