# Coin Card Execution Authorization Contract v1

Status: sealed execution-authorization authority

Purpose: define how the execution-authorization gate consumes three inputs —
a genuine promoted-presentation proof, a frozen transfer-intent snapshot, and
a frozen wallet-readiness snapshot — and decides whether a specific transfer
attempt may proceed to wallet interaction.

This module is Coin Card-specific. The Transfer Portal gets its own
execution-authorization module; this contract governs only the Coin Card surface.

## Core Rule

Authorization is a capability for one exact transfer attempt, not continuing
permission to execute equivalent transfers. Each call to `authorizeExecution()`
produces a new, independent result for that exact combination of inputs. A
second call with the same arguments produces a second, independently branded
result.

This module is a synchronous pure policy function. It makes no wallet calls,
no DOM reads, and no async operations. All inputs must be provided by the caller.

## Inputs

Three inputs are required:

1. **Promoted-presentation proof** — a genuine result produced by
   `IX_COIN_CARD_LIFECYCLE_PRESENTATION.promotePresentation()` and confirmed
   by `isPromotedPresentationResult() === true`. Resolver UNAVAILABLE outputs
   are not branded by `isPromotedPresentationResult()` and would therefore
   produce `EXECUTION_PRESENTATION_PROOF_INVALID`.

2. **Frozen transfer-intent snapshot** — a `Object.freeze()`-locked plain
   object carrying the exact facts the sender has reviewed: card identity,
   token address, execution contract, chain, recipient, and all three atomic
   amounts (recipient, platform fee, total debit).

3. **Frozen wallet-readiness snapshot** — a `Object.freeze()`-locked plain
   object carrying the current account, chain, balance, allowance, and
   provider readiness flag.

## Accepted Input Authority

The gate must first verify the presentation proof:

- `IX_COIN_CARD_LIFECYCLE_PRESENTATION` exists on `window`
- `isPromotedPresentationResult` is a function on that object
- `isPromotedPresentationResult(proof) === true`

If the authority is absent, the predicate is missing, or the predicate throws,
the gate returns `EXECUTION_POLICY_UNAVAILABLE` before inspecting other inputs.
If the predicate returns any value other than `true`, the gate returns
`EXECUTION_PRESENTATION_PROOF_INVALID` with `presentationEligible: false`.

## Public Function

```javascript
IX_COIN_CARD_EXECUTION_AUTHORIZATION.authorizeExecution(
  promotedPresentation,
  transferIntent,
  walletSnapshot
)
```

Accepts three inputs. Returns a frozen execution-authorization result.
Never throws.

## Exclusive Authorization Rule

Exactly one outcome earns `executionEligible: true`:

```text
isPromotedPresentationResult(proof) === true
AND all intent and snapshot fields are valid
AND wallet is ready, account valid, chain matches, recipient valid
AND no self-send
AND recipientAmount > 0
AND recipientAmount within [MIN, MAX] range
AND recipientAmount + platformFee === totalDebit
AND balance >= totalDebit
    → EXECUTION_AUTHORIZED
    → executionEligible: true
    → presentationEligible: true
    → result branded in private WeakSet
```

All other outcomes produce `executionEligible: false`.

## Execution Plan

The authorized result carries an `executionPlan` field:

```text
allowance >= totalDebit  →  TRANSFER_ONLY
allowance <  totalDebit  →  APPROVE_THEN_TRANSFER
```

`TRANSFER_ONLY` means IX_EXECUTION may call the transfer directly.
`APPROVE_THEN_TRANSFER` means IX_EXECUTION must approve first, then transfer.

## Blocked Outcome Table

| Condition                                           | Outcome                              | presentationEligible |
|-----------------------------------------------------|--------------------------------------|----------------------|
| Presentation API absent or predicate missing        | `EXECUTION_POLICY_UNAVAILABLE`       | false (unavailable)  |
| Presentation API predicate throws                   | `EXECUTION_POLICY_UNAVAILABLE`       | false (unavailable)  |
| Proof not recognized by isPromotedPresentationResult | `EXECUTION_PRESENTATION_PROOF_INVALID` | false              |
| Transfer intent invalid shape or not frozen         | `EXECUTION_INTENT_INVALID`           | true                 |
| Wallet snapshot invalid shape or not frozen         | `EXECUTION_WALLET_UNAVAILABLE`       | true                 |
| `providerReady` is false                            | `EXECUTION_WALLET_UNAVAILABLE`       | true                 |
| Account is not a valid Ethereum address             | `EXECUTION_ACCOUNT_INVALID`          | true                 |
| Chain IDs do not match                              | `EXECUTION_NETWORK_MISMATCH`         | true                 |
| Recipient is not a valid Ethereum address           | `EXECUTION_RECIPIENT_INVALID`        | true                 |
| Recipient === sender (self-send)                    | `EXECUTION_SELF_SEND_BLOCKED`        | true                 |
| `recipientAmountAtomic` is zero or negative         | `EXECUTION_AMOUNT_INVALID`           | true                 |
| Amount outside [MIN, MAX] policy range              | `EXECUTION_AMOUNT_OUT_OF_RANGE`      | true                 |
| recipientAmt + platformFee ≠ totalDebit             | `EXECUTION_TOTAL_MISMATCH`           | true                 |
| balance < totalDebit                                | `EXECUTION_FUNDS_INSUFFICIENT`       | true                 |

Blocked transfer-intent or wallet conditions do not revoke presentation
promotion: `presentationEligible` remains `true` when the proof itself was
valid. An invalid or absent presentation proof yields `presentationEligible:
false`.

## Failure Paths

| condition                                         | fact                   | outcome                          |
|---------------------------------------------------|------------------------|----------------------------------|
| Presentation API absent or predicate not a function | EXECUTION_UNAVAILABLE | EXECUTION_POLICY_UNAVAILABLE     |
| Presentation API predicate throws                 | EXECUTION_UNAVAILABLE  | EXECUTION_POLICY_UNAVAILABLE     |
| Proof fails isPromotedPresentationResult()        | EXECUTION_BLOCKED      | EXECUTION_PRESENTATION_PROOF_INVALID |
| Intent null, not an object, or not frozen         | EXECUTION_BLOCKED      | EXECUTION_INTENT_INVALID         |
| Intent missing required field or invalid field    | EXECUTION_BLOCKED      | EXECUTION_INTENT_INVALID         |
| Snapshot null, not an object, or not frozen       | EXECUTION_BLOCKED      | EXECUTION_WALLET_UNAVAILABLE     |
| Snapshot missing required field or invalid field  | EXECUTION_BLOCKED      | EXECUTION_WALLET_UNAVAILABLE     |

## Authorized Result Shape

All authorized results are frozen objects with the following fields:

```javascript
{
  fact: 'EXECUTION_AUTHORIZED',
  outcome: 'EXECUTION_AUTHORIZED',
  presentationEligible: true,
  executionEligible: true,
  executionPlan: 'TRANSFER_ONLY' | 'APPROVE_THEN_TRANSFER',
  sender: <snapshot.account>,
  recipient: <intent.recipient>,
  chainId: <intent.chainId>,
  tokenAddress: <intent.tokenAddress>,
  executionContractAddress: <intent.executionContractAddress>,
  recipientAmountAtomic: <intent.recipientAmountAtomic>,
  platformFeeAtomic: <intent.platformFeeAtomic>,
  totalDebitAtomic: <intent.totalDebitAtomic>,
  allowanceAtomic: <snapshot.allowanceAtomic>,
  balanceAtomic: <snapshot.balanceAtomic>,
  cardId: <intent.cardId>,
  manifestId: <intent.manifestId>,
}
```

The authorized result pins all transaction facts at decision time. IX_EXECUTION
must re-read current account and chainId before wallet interaction and compare
to the pinned values (TOCTOU guard — this comparison is IX_EXECUTION's
responsibility, not this module's).

## Blocked Result Shape

All blocked results are frozen objects with the following fields:

```javascript
{
  fact: 'EXECUTION_BLOCKED' | 'EXECUTION_UNAVAILABLE',
  outcome: <one of OUTCOMES>,
  presentationEligible: boolean,
  executionEligible: false,
}
```

Blocked results are diagnostic outputs, not authority proofs. They do not
enter the private WeakSet and cannot be used to satisfy
`isExecutionAuthorizedResult()`.

## Private Proof Predicate

```javascript
IX_COIN_CARD_EXECUTION_AUTHORIZATION.isExecutionAuthorizedResult(value)
```

Returns `true` only for results that carry `executionEligible: true` and were
produced by this authority instance. Returns `false` for:

- any blocked or unavailable result (even one produced by this authority)
- any result produced by a different VM context instance
- any fabricated or shape-alike object
- `null`, `undefined`, or any non-object

Only EXECUTION_AUTHORIZED results enter the private WeakSet. Blocked results
do not enter the WeakSet.

IX_EXECUTION must validate with `isExecutionAuthorizedResult()` before any
wallet interaction. IX_EXECUTION must mark the result consumed before approval
or transfer (replay protection — one-shot consumption is IX_EXECUTION's
responsibility, not this module's).

## IX_EXECUTION Responsibilities

This module produces an authorization result. IX_EXECUTION has three
additional responsibilities not performed by this module:

1. **Predicate validation** — call `isExecutionAuthorizedResult()` before any
   wallet interaction.
2. **Consumption tracking** — mark the result consumed before the first wallet
   call (approval or transfer). This module does not enforce single-use.
3. **TOCTOU guard** — re-read current `account` and `chainId` from the
   provider immediately before wallet interaction and compare against
   `result.sender` and `result.chainId`. If they differ, abort.

## Amount Policy Constants (V1)

```text
COIN_CARD_MIN_RECIPIENT_ATOMIC = 1                (1 atomic unit)
COIN_CARD_MAX_RECIPIENT_ATOMIC = 1000000000000000000  (10^18 atomic units)
```

Amounts are handled as BigInt throughout. The policy uses atomic integer
strings in transfer intent and wallet snapshot; conversion to BigInt occurs
inside `authorizeExecution()` after shape validation.

## V1 Outcomes Vocabulary

```text
EXECUTION_AUTHORIZED
EXECUTION_PRESENTATION_PROOF_INVALID
EXECUTION_INTENT_INVALID
EXECUTION_WALLET_UNAVAILABLE
EXECUTION_ACCOUNT_INVALID
EXECUTION_NETWORK_MISMATCH
EXECUTION_RECIPIENT_INVALID
EXECUTION_SELF_SEND_BLOCKED
EXECUTION_AMOUNT_INVALID
EXECUTION_AMOUNT_OUT_OF_RANGE
EXECUTION_TOTAL_MISMATCH
EXECUTION_FUNDS_INSUFFICIENT
EXECUTION_POLICY_UNAVAILABLE
```

## V1 Execution Plans Vocabulary

```text
TRANSFER_ONLY
APPROVE_THEN_TRANSFER
```

## Authority Chain Position

```text
authenticated records
        ↓  (coin-card-lifecycle-record-verification.js)
authenticated bundle
        ↓  (coin-card-lifecycle-bundle-verification.js)
selected coherent evidence
        ↓  (coin-card-lifecycle-record-selection.js)
resolved lifecycle fact
        ↓  (coin-card-lifecycle-resolution.js)
presentation-promotion policy
        ↓  (coin-card-lifecycle-presentation.js)
genuine promoted-presentation proof
        ↓
execution-authorization gate          ← this module
        ↓
EXECUTION_AUTHORIZED only
        ↓
IX_EXECUTION (validation + consumption + TOCTOU)
        ↓
wallet interaction
```

## Implementation

`app-web/frontend/public/card/coin-card-execution-authorization.js`

Exposes `window.IX_COIN_CARD_EXECUTION_AUTHORIZATION`. Loaded after
`coin-card-lifecycle-presentation.js` and before `coin-card-verification.js`
in the protected runtime load order.
