# Coin Card State Matrix

Status: tightened draft execution matrix
Date: 2026-07-07
Companion: `docs/product/coin-card/COIN_CARD_INVARIANT_CONTRACT.md`

This matrix defines the deterministic states the Coin Card must render. It intentionally separates view, route/form, wallet, and execution axes. The current live card uses one combined `data-state`; that is an implementation detail to be replaced.

## State Vector

```text
CoinCardState = {
  view: COLLAPSED | EXPANDED,
  routeAvailability: UNAVAILABLE | AVAILABLE,
  routeValidity: UNKNOWN | INVALID | VALID,
  routeMutability: EDITABLE | LOCKED,
  networkSupport: UNKNOWN | SUPPORTED | UNSUPPORTED,
  tokenSupport: UNKNOWN | SUPPORTED | UNSUPPORTED,
  amountText: EMPTY | TEMPORARY_INCOMPLETE | SYNTACTICALLY_COMPLETE | SYNTAX_INVALID,
  amountValidity: UNKNOWN | VALID | INVALID_CHARACTER | EXCESS_PRECISION | BELOW_MINIMUM | ABOVE_MAXIMUM | PRECISION_MISMATCH,
  funding: UNKNOWN | SUFFICIENT | INSUFFICIENT_USDC | INSUFFICIENT_GAS,
  wallet: DISCONNECTED | CONNECTING | CONNECTED_WRONG_NETWORK | CONNECTED_READY | CONNECTION_FAILED,
  execution: IDLE | PREVIEW_READY | EXECUTION_READY | APPROVAL_REQUESTED | APPROVAL_PENDING | APPROVAL_CONFIRMED | TRANSFER_REQUESTED | TRANSFER_PENDING | CONFIRMED | FAILED | INTERRUPTED | RECONCILING,
  receipt: NONE | LOCAL_READY | SUBMITTED | FINAL,
  error: NONE | ROUTE_ERROR | FORM_ERROR | FUNDING_ERROR | WALLET_ERROR | EXECUTION_ERROR | RECONCILIATION_ERROR,
  activeIntentId: string | null
}
```

Rendering must derive from this vector. Event handlers request transitions into this vector.

## View Axis

| View | Outer geometry | Visible fields | Enabled controls | Permitted transitions |
| --- | --- | --- | --- | --- |
| `COLLAPSED` | 216 x 44 | primary claim, network/token or attribution, status indicator, lettermark, expand control | expand only | `EXPANDED` |
| `EXPANDED` | 460 x 286 | all fixed regions and applicable workflow slots | collapse, amount input when allowed, execute/retry when allowed | `COLLAPSED` |

View changes do not mutate route, amount, wallet, execution, receipt, or error state.
Collapsed mode cannot initiate wallet connection, approval, or transfer.

## Route Axes

| Availability | Meaning | Recipient display | Controls | Transition causes |
| --- | --- | --- | --- | --- |
| `UNAVAILABLE` | no route source loaded | `—` | execute disabled | manifest/host data pending or absent |
| `AVAILABLE` | route source exists | depends on validity | validation may proceed | host/manifest route loaded |

| Validity | Meaning | Recipient display | Controls | Transition causes |
| --- | --- | --- | --- | --- |
| `UNKNOWN` | route source not validated yet | pending label | execute disabled | route loaded, validation pending |
| `INVALID` | route source exists but fails validation | controlled error code | execute disabled; retry route load if available | malformed recipient, unsupported route, revoked/unusable source |
| `VALID` | route is structurally executable | name plus middle-truncated address | amount input may be enabled | route validation passed |

| Mutability | Meaning | Recipient controls | Transition causes |
| --- | --- | --- | --- |
| `EDITABLE` | user may change recipient route before execution | recipient edit enabled only when execution idle/ready | editable route source |
| `LOCKED` | route fixed by manifest or host declaration | recipient edit disabled | locked route source |

`LOCKED` is not identity verification. If the source only validates a payment route, copy must say route-valid, not verified-recipient.

## Network/Token Axis

| Axis | State | Meaning | Network/token display | Controls |
| --- | --- | --- | --- |
| networkSupport | `UNKNOWN` | network not yet validated | pending label | execution disabled |
| networkSupport | `SUPPORTED` | current route can execute on supported network | approved enum, e.g. `POLYGON` | amount and execution may proceed if other axes allow |
| networkSupport | `UNSUPPORTED` | route cannot execute on current product surface | controlled unsupported label | execution disabled |
| tokenSupport | `UNKNOWN` | token not yet validated | pending label | execution disabled |
| tokenSupport | `SUPPORTED` | token can execute on supported surface | approved enum, e.g. `USDC` | amount and execution may proceed if other axes allow |
| tokenSupport | `UNSUPPORTED` | token cannot execute on current surface | controlled unsupported label | execution disabled |

## Amount Axis

| Amount/funding state | Input accepted? | Fee display | Total display | Status/error | Execute control |
| --- | --- | --- | --- | --- | --- |
| text `EMPTY` | yes | `—` | `—` | prompt to enter amount | disabled |
| text `TEMPORARY_INCOMPLETE` | yes | `—` | `—` | continue editing | disabled |
| validity `VALID`, funding `UNKNOWN` | yes | `format(feeUnits)` | `format(totalUnits)` | preview ready; funding unknown | no fund-moving request |
| validity `VALID`, funding `SUFFICIENT` | yes | `format(feeUnits)` | `format(totalUnits)` | execution ready only if all other gates pass | enabled only when execution is `EXECUTION_READY` |
| validity `INVALID_CHARACTER` | no | `—` | `—` | invalid amount character | disabled |
| validity `EXCESS_PRECISION` | no | `—` | `—` | max 6 decimals | disabled |
| validity `BELOW_MINIMUM` | no | `—` | `—` | below minimum | disabled |
| validity `ABOVE_MAXIMUM` | no | `—` | `—` | above maximum | disabled |
| validity `PRECISION_MISMATCH` | no | `—` | `—` | unsupported transfer precision | disabled |
| funding `INSUFFICIENT_USDC` | syntactically yes | `format(feeUnits)` | `format(totalUnits)` | insufficient USDC balance | disabled |
| funding `INSUFFICIENT_GAS` | syntactically yes | `format(feeUnits)` | `format(totalUnits)` | insufficient gas token | disabled |

Amount parsing must return integer `amountUnits`, not a float. Fee and total derive from `amountUnits`.

## Wallet Axis

| Wallet state | Status label | Primary control | Amount editable? | Permitted transitions |
| --- | --- | --- | --- | --- |
| `DISCONNECTED` | `Connect wallet` | connect | yes if execution idle/preview-ready | `CONNECTING` |
| `CONNECTING` | `Connecting` | disabled active control | no | `CONNECTED_READY`, `CONNECTED_WRONG_NETWORK`, `CONNECTION_FAILED`, `DISCONNECTED` |
| `CONNECTED_WRONG_NETWORK` | `Wrong network` | switch network | yes unless execution pending | `CONNECTED_READY`, `CONNECTION_FAILED`, `DISCONNECTED` |
| `CONNECTED_READY` | `Ready` | continue/confirm if execution ready | yes until execution request begins | `DISCONNECTED`, `CONNECTED_WRONG_NETWORK` |
| `CONNECTION_FAILED` | controlled wallet error | retry connect | yes if execution idle/preview-ready | `CONNECTING`, `DISCONNECTED` |

Wallet changes must not erase route or parsed amount. Account/network changes during approval or transfer request become execution interruptions if they invalidate the flow.

## Execution Axis

| Execution state | Status label | Visible output | CTA/chip behavior | Receipt state | Permitted transitions |
| --- | --- | --- | --- | --- | --- |
| `IDLE` | `Enter amount` or route status | route and amount fields | disabled unless amount valid | `NONE` | `PREVIEW_READY`, `FAILED` |
| `PREVIEW_READY` | `Preview ready` | fee/total preview | connect or disabled; no fund-moving request | `LOCAL_READY` when draft receipt exists | `EXECUTION_READY`, `FAILED`, `INTERRUPTED` |
| `EXECUTION_READY` | `Ready` | fee/total preview plus validated funding/preflight | approve/transfer if expanded | `LOCAL_READY` when draft receipt exists | `APPROVAL_REQUESTED`, `TRANSFER_REQUESTED`, `FAILED`, `INTERRUPTED` |
| `APPROVAL_REQUESTED` | `Approve in wallet` | approval amount = total debit | disabled active | `LOCAL_READY` | `APPROVAL_PENDING`, `INTERRUPTED`, `FAILED` |
| `APPROVAL_PENDING` | `Approval pending` | approval hash if known | disabled active | `SUBMITTED` if approval hash is stored | `APPROVAL_CONFIRMED`, `FAILED`, `INTERRUPTED`, `RECONCILING` |
| `APPROVAL_CONFIRMED` | `Approval confirmed` | approval hash; transfer prompt next | disabled or continue automatically by explicit transition | `LOCAL_READY` or `SUBMITTED` | `TRANSFER_REQUESTED`, `INTERRUPTED` |
| `TRANSFER_REQUESTED` | `Confirm transfer` | amount, fee, total, recipient | disabled active | `LOCAL_READY` | `TRANSFER_PENDING`, `INTERRUPTED`, `FAILED` |
| `TRANSFER_PENDING` | `Confirming` | transfer hash and explorer link | disabled active | `SUBMITTED` | `CONFIRMED`, `FAILED`, `RECONCILING` |
| `CONFIRMED` | `Confirmed` | confirmed amount, transfer hash, receipt/proof link | no fund-moving action; new transfer only by explicit reset | `FINAL` | explicit new transaction only |
| `FAILED` | controlled failure title | error code, short explanation, retry if allowed | retry if retryable | `FINAL` or `LOCAL_READY` depending failure point | `PREVIEW_READY`, `EXECUTION_READY`, explicit reset |
| `INTERRUPTED` | controlled interruption title | reason, funds-moved status, retry guidance | retry if retryable | `FINAL` or `LOCAL_READY` depending failure point | `PREVIEW_READY`, `EXECUTION_READY`, `RECONCILING`, explicit reset |
| `RECONCILING` | `Checking chain` | known hash or local receipt facts | disabled active | `SUBMITTED` | `CONFIRMED`, `FAILED`, `INTERRUPTED` |

## Legal Combination Invariants

| Invariant | Required combination |
| --- | --- |
| Preview ready | route availability `AVAILABLE`, route validity `VALID`, network support `SUPPORTED`, token support `SUPPORTED`, amount text `SYNTACTICALLY_COMPLETE`, amount validity `VALID`, and no terminal receipt for active intent |
| Execution ready | every preview-ready condition plus `view = EXPANDED`, funding `SUFFICIENT`, wallet `CONNECTED_READY`, active sender, and current preflight facts |
| Approval requested | `view = EXPANDED`, funding `SUFFICIENT`, wallet `CONNECTED_READY`, active `intentId`, and execution `EXECUTION_READY` immediately before transition |
| Approval pending | approval hash exists for active `intentId` |
| Transfer requested | `view = EXPANDED`, funding `SUFFICIENT`, wallet `CONNECTED_READY`, active `intentId`, valid amount units, fee units, total units |
| Transfer pending | transfer hash exists for active `intentId` |
| Confirmed | transfer hash, successful on-chain receipt, receipt `FINAL`, and immutable transaction facts |
| Reconciliation | transfer hash or stored receipt exists; result not yet final |
| Collapsed | cannot initiate connect, approval, or transfer |
| Invalid route | cannot enter `PREVIEW_READY`, `EXECUTION_READY`, `APPROVAL_REQUESTED`, `APPROVAL_PENDING`, `TRANSFER_REQUESTED`, or `TRANSFER_PENDING` for a new active intent |
| Invalid amount | cannot enter `PREVIEW_READY`, `EXECUTION_READY`, `APPROVAL_REQUESTED`, or `TRANSFER_REQUESTED` for a new active intent |
| Final receipt | cannot be overwritten by later form, wallet, route, or funding changes |

Impossible combinations:

- route availability `UNAVAILABLE` with execution `PREVIEW_READY` or `EXECUTION_READY`
- route validity `INVALID` with new execution `PREVIEW_READY` or `EXECUTION_READY`
- amount validity not `VALID` with new execution `PREVIEW_READY` or `EXECUTION_READY`
- funding `INSUFFICIENT_USDC` or `INSUFFICIENT_GAS` with `APPROVAL_REQUESTED` or `TRANSFER_REQUESTED`
- execution `TRANSFER_PENDING` without transfer hash
- execution `CONFIRMED` without transfer hash and final successful receipt
- receipt `NONE` with execution `CONFIRMED`
- collapsed view initiating any wallet prompt

## Rendering Precedence

Primary status:

1. confirmed or reconciliation-critical execution state
2. active approval/transfer execution state
3. deterministic execution failure or interruption
4. route failure
5. wallet/network blocker
6. funding blocker
7. amount validation
8. idle/ready instruction

CTA:

1. collapsed view -> expand only
2. confirmed -> no fund-moving action
3. reconciling or pending execution -> disabled active control
4. retryable failure/interruption -> retry
5. route/form/funding blocker -> disabled control
6. wallet disconnected -> connect
7. wrong network -> switch network
8. ready and connected -> approve or transfer

Body/result:

1. confirmed receipt/result
2. reconciliation facts
3. active execution facts
4. failure/interruption facts
5. route/source error
6. editable transaction form

## Composite Rendering Matrix

These rows are named product states made from the independent axes. They are not a replacement for the axes.

| Product state | Route axes | Amount/funding axes | Wallet | Execution | Body/output | CTA/chip | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Loading route | availability `UNAVAILABLE`, validity `UNKNOWN` | text `EMPTY` | `DISCONNECTED` | `IDLE` | structural shell, route pending | disabled | `Loading` |
| Route invalid | availability `AVAILABLE`, validity `INVALID` | any | any | `FAILED` or `IDLE` | route error code and guidance | retry route if available | controlled route error |
| Empty amount | availability `AVAILABLE`, validity `VALID`, mutability any | text `EMPTY` | `DISCONNECTED` | `IDLE` | amount input, fee `—`, total `—` | disabled | `Enter amount` |
| Invalid amount | availability `AVAILABLE`, validity `VALID` | invalid validity state | any non-pending | `IDLE` | amount input plus field error | disabled | controlled form error |
| Amount valid, funding unknown | availability `AVAILABLE`, validity `VALID` | amount `VALID`, funding `UNKNOWN` | any non-pending | `PREVIEW_READY` | amount, fee, total, recipient | disabled or connect-only | `Preview ready` |
| Amount ready, wallet disconnected | availability `AVAILABLE`, validity `VALID` | amount `VALID`, funding `UNKNOWN` | `DISCONNECTED` | `PREVIEW_READY` | amount, fee, total, recipient | connect if expanded | `Preview ready` |
| Wallet connecting | availability `AVAILABLE`, validity `VALID` | amount `VALID`, funding `UNKNOWN` | `CONNECTING` | `PREVIEW_READY` | preview retained | disabled active | `Connecting` |
| Wrong network | availability `AVAILABLE`, validity `VALID` | amount `VALID`, funding `UNKNOWN` | `CONNECTED_WRONG_NETWORK` | `PREVIEW_READY` | preview retained | switch network if expanded | `Wrong network` |
| Ready to approve | availability `AVAILABLE`, validity `VALID` | amount `VALID`, funding `SUFFICIENT` | `CONNECTED_READY` | `EXECUTION_READY` | preview retained | approve/confirm if expanded | `Ready` |
| Approval requested | availability `AVAILABLE`, validity `VALID` | amount `VALID`, funding `SUFFICIENT` | `CONNECTED_READY` | `APPROVAL_REQUESTED` | approval amount and recipient retained | disabled active | `Approve in wallet` |
| Approval pending | availability `AVAILABLE`, validity `VALID` | amount `VALID`, funding `SUFFICIENT` | `CONNECTED_READY` | `APPROVAL_PENDING` | approval hash | disabled active | `Approval pending` |
| Approval confirmed | availability `AVAILABLE`, validity `VALID` | amount `VALID`, funding `SUFFICIENT` | `CONNECTED_READY` | `APPROVAL_CONFIRMED` | preview retained | disabled or next-step control | `Approval confirmed` |
| Transfer requested | availability `AVAILABLE`, validity `VALID` | amount `VALID`, funding `SUFFICIENT` | `CONNECTED_READY` | `TRANSFER_REQUESTED` | amount, fee, total, recipient | disabled active | `Confirm transfer` |
| Transfer pending | availability `AVAILABLE`, validity `VALID` | amount `VALID`, funding `SUFFICIENT` | `CONNECTED_READY` | `TRANSFER_PENDING` | transfer hash/explorer link | disabled active | `Confirming` |
| Confirmed | route facts frozen from intent | transaction facts frozen from intent | any | `CONFIRMED` | amount, recipient, hash, receipt/proof | no fund-moving action | `Confirmed` |
| Failed retryable | any | any | any | `FAILED` | code, explanation, retry guidance | retry | controlled error |
| Interrupted retryable | any | any | any | `INTERRUPTED` | reason, funds-moved status, retry guidance | retry | controlled interruption |
| Reconciliation | any | any | any | `RECONCILING` | known hash/local receipt facts | disabled active | `Checking chain` |

## Output Field Matrix

| Field | Source | Empty/default | Valid states | Formatting | Visibility |
| --- | --- | --- | --- | --- | --- |
| Recipient name | route manifest/host data | `—` | availability `AVAILABLE`, validity `VALID` | one-line ellipsis | expanded; collapsed only if primary claim uses it |
| Recipient address | route manifest/host data | `—` | availability `AVAILABLE`, validity `VALID` | middle truncate; full accessible value | expanded details and receipt states |
| Network | route/config | `—` | network support `SUPPORTED` | controlled enum | collapsed and expanded |
| Token | route/config | `—` | token support `SUPPORTED` | controlled enum | collapsed and expanded |
| Amount input | user or locked route | placeholder `0.00` | execution `IDLE`/`PREVIEW_READY`/`EXECUTION_READY`; not pending | raw string plus parsed units | expanded input state |
| Amount summary | `amountUnits` | `—` | amount validity `VALID` and later | exact integer-unit formatter | expanded; collapsed only as summarized status if specified |
| Fee percent | config/contract | `Fee unavailable` if unknown | route supported | integer basis-point formatter, exactly two percent decimals | expanded |
| Fee amount | `feeUnits` | `—` | amount validity `VALID` and later | exact integer-unit formatter | expanded |
| Total debit | `totalUnits` | `—` | amount validity `VALID` and later | exact integer-unit formatter | expanded |
| Wallet status | wallet axis | `Disconnected` | all wallet states | controlled enum | status region |
| Execution status | execution axis | `Idle` | all execution states | controlled enum | status region |
| Approval hash | wallet/RPC result | `—` | approval pending/confirmed | middle truncate | expanded execution/receipt |
| Transfer hash | wallet/RPC result | `—` | transfer pending/confirmed/reconciling | middle truncate plus explorer link | expanded execution/receipt |
| Confirmation result | receipt/RPC | `—` | confirmed/failed/interrupted | controlled result label | expanded receipt/result |
| Error code | classifier | `—` | error states | controlled code | status/error region |
| Error explanation | classifier | `—` | error states | max two lines | expanded error slot |
| Retry availability | classifier | unavailable | failed/interrupted retryable | controlled label | action region |

## Input Matrix

| Input | Accepted | Rejected state | Normalization |
| --- | --- | --- | --- |
| Amount | text input with decimal grammar; complete value has digits plus optional decimal and 1-6 fractional digits; temporary values include empty, `.`, and `1.` | `INVALID_CHARACTER`, `EXCESS_PRECISION`, `BELOW_MINIMUM`, `ABOVE_MAXIMUM` only when `maximumAmountUnits` is configured, `PRECISION_MISMATCH` | trim paste edges, normalize `.5` to `0.5`, parse string to `BigInt` micro-USDC |
| Recipient | valid EVM address from approved route source | `UNAVAILABLE`, `INVALID` | lowercase/checksum-preserving display; canonical lower-case comparison |
| Network | approved chain ID | `UNSUPPORTED` | numeric chain ID |
| Token | approved token enum/address | `UNSUPPORTED` | token symbol plus token address from config |
| Expand/collapse | user activation | none unless documented accessibility/wallet defect | view-state transition only |
| Execute | expanded view plus legal ready vector | collapsed view or illegal vector | execution transition request with active `intentId` |

Amount lexical cases:

| Input | State |
| --- | --- |
| `` | text `EMPTY` |
| `.` | text `TEMPORARY_INCOMPLETE` |
| `1.` | text `TEMPORARY_INCOMPLETE` |
| `.5` | complete, normalized to `0.5` |
| `0001.00` | complete, normalized for display |
| ` 1.00 ` pasted | complete after edge trim |
| `1 0` | `INVALID_CHARACTER` |
| `1,000` | `INVALID_CHARACTER` |
| `+1` | `INVALID_CHARACTER` |
| `-1` | `INVALID_CHARACTER` |
| `1e3` | `INVALID_CHARACTER` |
| `1.0000001` | `EXCESS_PRECISION` |
| trimmed length over 32 | `INVALID_CHARACTER` if the PROPOSED UI guard is accepted |

Integer-unit formatting examples:

| Units | Display |
| ---: | --- |
| `0` | `0.00 USDC` |
| `1000000` | `1.00 USDC` |
| `1100000` | `1.10 USDC` |
| `1000001` | `1.000001 USDC` |
| `10010` | `0.01001 USDC` |

## Permitted Transition Table

| From | Cause | To |
| --- | --- | --- |
| route availability `UNAVAILABLE` | manifest/host data loaded | route availability `AVAILABLE`; route validity becomes `VALID` or `INVALID`; mutability becomes `EDITABLE` or `LOCKED` |
| route availability `UNAVAILABLE` | missing data | route availability `UNAVAILABLE`; route validity `UNKNOWN` |
| route available/valid + text `EMPTY` | user enters complete valid amount | amount validity `VALID`; execution may become `PREVIEW_READY`; `EXECUTION_READY` requires funding/wallet/preflight invariants |
| any amount text/validity state | user clears amount | text `EMPTY`, amount validity `UNKNOWN`, execution `IDLE` unless immutable broadcast facts exist |
| amount validity `VALID` | balance refresh shows insufficient USDC | funding `INSUFFICIENT_USDC` |
| amount validity `VALID` | gas readiness check fails | funding `INSUFFICIENT_GAS` |
| wallet `DISCONNECTED` | user activates connect | wallet `CONNECTING` |
| wallet `CONNECTING` | account returned on supported network | wallet `CONNECTED_READY` |
| wallet `CONNECTING` | account returned on unsupported network | wallet `CONNECTED_WRONG_NETWORK` |
| wallet `CONNECTED_WRONG_NETWORK` | switch succeeds | wallet `CONNECTED_READY` |
| execution `EXECUTION_READY` | expanded view, approval needed, legal vector, user activates execute | create `intentId`, enter `APPROVAL_REQUESTED` |
| `APPROVAL_REQUESTED` | matching `intentId` approval hash received | `APPROVAL_PENDING` |
| `APPROVAL_PENDING` | matching `intentId` approval receipt confirmed | `APPROVAL_CONFIRMED` |
| `APPROVAL_CONFIRMED` | matching `intentId` final readiness gates pass | `TRANSFER_REQUESTED` |
| execution `EXECUTION_READY` | expanded view, no approval needed, legal vector, user activates execute | create `intentId`, enter `TRANSFER_REQUESTED` |
| `TRANSFER_REQUESTED` | matching `intentId` transfer hash received and receipt persisted | `TRANSFER_PENDING` |
| `TRANSFER_PENDING` | transfer receipt confirms success | `CONFIRMED` |
| pending execution | user rejects wallet prompt before broadcast | `INTERRUPTED` |
| pending execution | deterministic preflight failure | `FAILED` |
| pending execution | hash known but result unknown | `RECONCILING` |
| `RECONCILING` | chain confirms success | `CONFIRMED` |
| `RECONCILING` | chain confirms failure | `FAILED` |
| retryable `FAILED`/`INTERRUPTED` | user retries without changing route | `PREVIEW_READY` or `EXECUTION_READY` if form/wallet/funding axes permit |
| any view | user expands/collapses | opposite view; all other axes unchanged |

Async event correlation:

- every approval, transfer, receipt, timeout, and reconciliation event must carry `intentId`
- events with a stale `intentId` must not mutate the active transaction
- stale events may only reconcile an archived receipt that matches their hash/intent

Reset/new transaction:

- creates a new `intentId`
- invalidates pending events for the prior active intent
- clears amount text and integer calculation fields for the new intent
- preserves locked route fields
- preserves wallet connection if still valid
- re-reads allowance, balance, gas readiness, and network before the next fund-moving request
- preserves prior receipts and never overwrites confirmed evidence
- preserves view state and restores focus to the amount field when expanded/editable

## Current Live State Mapping

| Current `card.js` state | Target axes |
| --- | --- |
| `BOOT` | route availability `UNAVAILABLE`, amount text `EMPTY`, wallet `DISCONNECTED`, execution `IDLE` |
| `MANIFEST_LOADING` | route availability `UNAVAILABLE`, route validity `UNKNOWN`, execution `IDLE` |
| `VERIFIED` | route availability `AVAILABLE`, route validity `VALID`, route mutability `LOCKED`, amount text `EMPTY`, execution `IDLE` |
| `AMOUNT_READY` | route availability `AVAILABLE`, route validity `VALID`, route mutability `LOCKED`, amount validity `VALID`, execution `PREVIEW_READY` transient |
| `TRANSFER_INTENT_READY` | route availability `AVAILABLE`, route validity `VALID`, route mutability `LOCKED`, amount validity `VALID`, wallet `DISCONNECTED`, execution `PREVIEW_READY` |
| `CONNECTING` | wallet `CONNECTING`, execution `PREVIEW_READY` |
| `WRONG_NETWORK` | wallet `CONNECTED_WRONG_NETWORK`, execution `PREVIEW_READY` |
| `SWITCHING_NETWORK` | wallet `CONNECTING` or network switch pending, execution `PREVIEW_READY` |
| `READY_TO_SEND` | wallet `CONNECTED_READY`, execution `EXECUTION_READY` |
| `APPROVE_PENDING` | execution `APPROVAL_REQUESTED` and `APPROVAL_PENDING` collapsed together |
| `EXECUTE_PENDING` | execution `TRANSFER_REQUESTED` and `TRANSFER_PENDING` collapsed together |
| `CONFIRMED` | execution `CONFIRMED` |
| `TX_FAILED` | execution `FAILED` |
| `REVOKED` | route availability `AVAILABLE`, route validity `INVALID`, execution `FAILED` |
| `ERROR` | route validity `INVALID` or source error; shell currently hidden |

## Ambiguous Or Unreachable States Found

- `AMOUNT_READY` is entered and immediately superseded by `TRANSFER_INTENT_READY` in `buildIntent()`.
- `APPROVE_PENDING` covers both "wallet approval requested" and "approval transaction submitted/awaiting receipt".
- `EXECUTE_PENDING` covers both "wallet transfer requested" and "transfer submitted/awaiting receipt".
- `ERROR` is a manifest-level source state, not a transaction state, but it controls the same root `data-state`.
- `WRONG_NETWORK` reuses the input panel and changes `ccTxLabel`, mixing wallet status with form state.
- `TX_FAILED` hides the action region, leaving retry behavior undefined.
- `REVOKED` is route invalidity but is represented as a card body execution/error panel.
- Insufficient balance exists in the Transfer Portal path, but not as an explicit Coin Card amount state.
- Invalid character and excess precision are delegated to browser number input behavior and are not represented in the card state model.

## Deterministic Review Surface Requirements

Create a review page after these docs are accepted. It must not call a wallet, RPC, registry, analytics, or live contract.

Minimum requirements:

- one fixture for every composite product state in this matrix
- toggle for `COLLAPSED` and `EXPANDED`
- long recipient name fixture
- long recipient address fixture
- long transaction hash fixture
- every amount validation state
- every wallet state
- every execution state
- every retryable and non-retryable error presentation
- visual markers for fixed region bounds
- screenshot-test hooks for exterior dimensions and slot overflow
- no asynchronous callback required to inspect any state

The review surface is not a new product surface. It is a deterministic renderer harness for proving the state matrix.
