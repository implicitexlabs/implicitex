# Coin Card Invariant Contract

Status: active
Date: 2026-07-07
Amended: 2026-08-09 — public username identity invariant added (Invariant 3)
Scope: Coin Card product identity, artifact authority, structure, state, visibility, math, and execution presentation

---

## Foundational Product Invariants

These three invariants govern what Coin Card is, how its public identity resolves,
and what an artifact is authorized to do.
They are unconditional. No implementation decision overrides them.

### Invariant 1 — Coin Card Identity

A Coin Card is a product object, not a URL, webpage, account, wallet, or payment
transaction. URLs and interfaces locate, render, manage, verify, or interact with
Coin Cards.

### Invariant 2 — Artifact Authority Boundary

A CoinCardArtifact is an immutable, signed assertion about a Coin Card at a specific
issuance point. It establishes provenance and historical state. It does not
independently authorize execution. Any privileged action against a Coin Card requires
authoritative lifecycle and route resolution under the Coin Card execution contracts.

**Consequence:** A CoinCardArtifact may be copied, cached, downloaded, embedded, or
archived without becoming a bearer credential capable of authorizing a payment. The
registry — not the artifact — determines what is true now.

### Invariant 3 — One Exact Public Username

A Coin Card account has exactly one active username. The normalized username
resolves by exact match through both `username.coincard.click` and
`coincard.click/username`; the path form redirects to the canonical subdomain.
Internal account and Coin Card IDs are opaque and are never public usernames or
alternate routing aliases. Search may discover a username from partial input,
but search results never substitute for exact route resolution.

For the legacy identity boundary and governed migration sequence, see
`COIN_CARD_PUBLIC_IDENTITY_AND_LEGACY_MIGRATION_V1.md`.

---

This document defines the rules the Coin Card runtime must satisfy before further runtime refactoring. It treats Coin Card as a fixed-dimension payment instrument, not a responsive content component.

The stateless embed audit is background only. This contract controls the next implementation lane, but it is not a parallel source of truth. It explains rules that must be pushed into the machine-readable artifact, structure contract, architecture validator, deterministic renderer, and visual tests.

## Source Files Audited

- `app-web/frontend/public/card/index.html`
- `app-web/frontend/public/card/card.css`
- `app-web/frontend/public/card/card.js`
- `app-web/frontend/public/js/ix-execution.js`
- `app-web/frontend/public/js/wallet.js`
- `app-web/contracts/implicitex_transfer.sol`
- `docs/product/coin-card/coin-card.tokens.json`
- `docs/product/coin-card/coin-card-spec-v1.md`
- `docs/product/coin-card/coin-card.structure/v1.json`

## Canonical Documentation Root

The canonical contract root for Coin Card geometry, tokens, artifact graph, structure mapping, execution behavior, and state-machine prose is:

```text
docs/product/coin-card/
```

The implementation-local checkpoint root is:

```text
app-web/docs/product/coin-card/
```

`app-web/docs/product/coin-card/` is historical/implementation-local checkpoint documentation unless a file there explicitly says it is generated from the canonical root. The architecture validator and token tooling must consume `docs/product/coin-card/` directly.

## Rendering Rule

Coin Card rendering must be a pure projection of an explicit, legal state vector:

```text
Rendered Coin Card = render({
  viewState,
  routeAvailability,
  routeValidity,
  routeMutability,
  networkSupport,
  tokenSupport,
  amountTextState,
  amountValidity,
  fundingState,
  walletState,
  executionState,
  receiptState,
  errorState,
  activeIntentId,
  values
})
```

Event handlers may request transitions. They must not independently improvise labels, dimensions, visibility, status output, chip class, or enabled controls.

## Canonical Geometry

Canonical geometry comes from `docs/product/coin-card/coin-card.tokens.json` and is explained by `docs/product/coin-card/coin-card-spec-v1.md`.

All dimensions are CSS pixels and use `box-sizing: border-box`.

| Form factor | Width | Height | Provenance | Source |
| --- | ---: | ---: | --- | --- |
| Collapsed acceptance mark | 216 | 44 | CANONICAL | `coin-card/coin-card.tokens.json:formFactors.collapsedAcceptanceMark.outer` |
| Expanded horizontal card | 460 | 286 | CANONICAL | `coin-card/coin-card.tokens.json:formFactors.expandedHorizontal.outer` |

The current live `/card/` implementation does not yet conform. `card.css` uses `width: 100%`, `max-width: 440px`, grid rows with `auto`, and no fixed outer height. That is an implementation gap, not the contract.

## Fixed Regions

Provenance labels:

- `CANONICAL` means the value is already in the approved token/spec source.
- `MEASURED` means the value was extracted from an approved rendered artifact but is not yet tokenized.
- `DERIVED` means the value is mathematically calculated from canonical values.
- `PROPOSED` means the value is awaiting design/token approval and must not be treated as constitutional.

The expanded card is divided into fixed planes:

| Region | X | Y | W | H | Owner | Provenance |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| identity header | 0 | 0 | 460 | 136 | structural identity | CANONICAL, `expandedHorizontal.planes.identityHeader` |
| credential/body | 0 | 136 | 460 | 108 | stateful workflow | CANONICAL, `expandedHorizontal.planes.credential` |
| action/status | 0 | 244 | 460 | 42 | stateful workflow | CANONICAL, `expandedHorizontal.planes.action` |

The collapsed card is divided into fixed regions:

| Region | X | Y | W | H | Owner | Provenance |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| identity area | 0 | 0 | 172 | 44 | structural identity | CANONICAL, `collapsedAcceptanceMark.grid.identityArea` |
| lettermark cell | 172 | 0 | 44 | 44 | structural identity | CANONICAL, `collapsedAcceptanceMark.grid.lettermarkCell` |

Structural identity regions never disappear. Workflow regions may change rendered content, but their reserved geometry must not change.

## Expanded Slots

| Slot | X | Y | W | H | Overflow | Provenance |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| primary claim | 20 | 20 | 300 | 20 | single-line ellipsis | CANONICAL |
| recipient name | 20 | 46 | 300 | 16 | single-line ellipsis | CANONICAL |
| network/token | 20 | 67 | 140 | 12 | controlled enum | CANONICAL |
| product identity | 20 | 94 | 140 | 12 | fixed asset fit | CANONICAL |
| attribution | 20 | 111 | 180 | 10 | single-line ellipsis | CANONICAL |
| recipient row | 20 | 136 | label/value row | 18 | middle-truncate address | CANONICAL row; label/value widths from token credential slot |
| route row | 20 | 154 | label/value row | 18 | controlled enum | CANONICAL row; label/value widths from token credential slot |
| destination row | 20 | 172 | label/value row | 18 | middle-truncate address | CANONICAL row; label/value widths from token credential slot |
| amount row | 20 | 190 | label/value row | 18 | fixed numeric format | CANONICAL row; label/value widths from token credential slot |
| fee row | 20 | 208 | label/value row | 18 | fixed numeric format | CANONICAL row; label/value widths from token credential slot |
| total row | 20 | 226 | label/value row | 18 | fixed numeric format | CANONICAL row; label/value widths from token credential slot |
| status indicator | 20 | 260 | 6 | 6 | controlled enum | CANONICAL |
| status text | 34 | 255 | 210 | 14 | controlled enum or code | CANONICAL |
| CTA/control | 302 | 254 | 138 | 22 | fixed label enum | CANONICAL |
| expand/collapse control | 420 | 20 | 20 | 20 | fixed icon/label enum | PROPOSED; visual approval required before tokenizing |

No dynamic value may create a new row, push another slot, change the card size, widen the card, or cause text outside its reserved slot.

## Collapsed Slots

| Slot | X | Y | W | H | Overflow | Provenance |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| primary claim | 12 | 7 | 128 | 14 | single-line ellipsis | CANONICAL |
| network/token or attribution | 12 | 25 | 148 max | 10 | controlled enum or single-line ellipsis | CANONICAL |
| status indicator | 148 | 18 | 6 | 6 | controlled enum | CANONICAL |
| lettermark | 176 | 4 | 36 | 36 | fixed asset fit | CANONICAL |
| expand control hit target | 0 | 0 | 216 | 44 | no fund-moving action | CANONICAL as full collapsed card hit target |

Collapsed mode is a presentation state only. It must not alter route, amount, wallet, execution, receipt, error, or calculation state.

## Overflow Rules

| Field | Policy |
| --- | --- |
| Recipient name | one line; ellipsis |
| Full recipient address | middle truncate `0x1234...abcd`; full value available through title/accessible label/copy action where applicable |
| Sender address | middle truncate |
| Transaction hash | middle truncate or short explorer label; full hash available through title/accessible label |
| Network/token | controlled enum; no wrapping |
| Status text | controlled enum; single-line ellipsis if needed |
| Error code | controlled enum/code; one line |
| Error explanation | maximum two lines inside reserved error slot; ellipsis after line 2 |
| Amount, fee, total | fixed numeric format; no wrapping |
| CTA label | controlled enum; no wrapping |

## State Axes

The card must model independent state axes. A single string such as `VERIFIED` or `READY_TO_SEND` is not sufficient.

### View State

- `COLLAPSED`
- `EXPANDED`

View transitions are presentation-only. They must preserve all values, focus intent, transaction state, wallet state, receipt state, and calculations.

### Route Availability

- `UNAVAILABLE`
- `AVAILABLE`

This axis answers only whether a route source exists.

### Route Validity

- `UNKNOWN`
- `INVALID`
- `VALID`

This axis answers only whether the recipient route is structurally executable. It does not answer whether the user may edit it.

### Route Mutability

- `EDITABLE`
- `LOCKED`

This axis answers only whether the user can alter the recipient route. A route may be `VALID` and `LOCKED`, `VALID` and `EDITABLE`, or `INVALID` and `LOCKED`.

`LOCKED` does not mean recipient identity or wallet ownership has been verified unless a separate registered-card contract declares that proof.

### Network Support

- `UNKNOWN`
- `SUPPORTED`
- `UNSUPPORTED`

### Token Support

- `UNKNOWN`
- `SUPPORTED`
- `UNSUPPORTED`

For v1 production, Polygon USDC is the supported route. Unsupported network/token values remain inside the reserved status/error regions.

### Amount Text State

- `EMPTY`
- `TEMPORARY_INCOMPLETE`
- `SYNTACTICALLY_COMPLETE`
- `SYNTAX_INVALID`

This axis answers only whether the editable text can be parsed or may remain in the field while editing.

### Amount Validity

- `UNKNOWN`
- `VALID`
- `INVALID_CHARACTER`
- `EXCESS_PRECISION`
- `BELOW_MINIMUM`
- `ABOVE_MAXIMUM`
- `PRECISION_MISMATCH`

Amount validity is derived from parsed integer USDC units and contract/product limits. It must not be inferred from ad hoc text, `parseFloat`, or input truthiness.

### Funding State

- `UNKNOWN`
- `SUFFICIENT`
- `INSUFFICIENT_USDC`
- `INSUFFICIENT_GAS`

Funding is not amount validity. A valid amount can still be unfundable by the connected wallet.

### Wallet State

- `DISCONNECTED`
- `CONNECTING`
- `CONNECTED_WRONG_NETWORK`
- `CONNECTED_READY`
- `CONNECTION_FAILED`

### Execution State

- `IDLE`
- `PREVIEW_READY`
- `EXECUTION_READY`
- `APPROVAL_REQUESTED`
- `APPROVAL_PENDING`
- `APPROVAL_CONFIRMED`
- `TRANSFER_REQUESTED`
- `TRANSFER_PENDING`
- `CONFIRMED`
- `FAILED`
- `INTERRUPTED`
- `RECONCILING`

`PREVIEW_READY` means route and amount are valid and fee/total can be displayed. `EXECUTION_READY` means every fund-moving gate has passed: expanded view, supported network/token, connected sender, sufficient USDC, sufficient gas readiness, valid route and amount, and current preflight facts. Execution state owns fund-moving status, button availability, spinner presentation, transaction hash presentation, retry availability, and terminal receipt output.

## Transition Rules

- `COLLAPSED <-> EXPANDED` is always presentation-only.
- Route availability must be `AVAILABLE`, route validity must be `VALID`, network support must be `SUPPORTED`, and token support must be `SUPPORTED` before execution can become `PREVIEW_READY` or `EXECUTION_READY`.
- Amount text must be `SYNTACTICALLY_COMPLETE` and amount validity must be `VALID` before execution can become `PREVIEW_READY` or `EXECUTION_READY`.
- `EXECUTION_READY` additionally requires expanded view, connected sender, funding `SUFFICIENT`, and current preflight facts.
- Funding must be `SUFFICIENT` before a fund-moving request can be initiated. If funding is `UNKNOWN`, the card may connect or inspect but must not request approval or transfer.
- Wallet state must be `CONNECTED_READY` before execution can request transfer.
- `APPROVAL_REQUESTED` is entered before opening the approval wallet prompt.
- `APPROVAL_PENDING` is entered after approval hash is received.
- `APPROVAL_CONFIRMED` is entered after approval receipt confirms.
- `TRANSFER_REQUESTED` is entered before opening the fund-moving wallet prompt.
- `TRANSFER_PENDING` is entered after transfer hash is received.
- `CONFIRMED` requires a confirmed transfer receipt.
- `FAILED` means a deterministic failure occurred and the card can explain it.
- `INTERRUPTED` means the flow did not complete and funds are not known to have moved.
- `RECONCILING` means a broadcast hash or local receipt needs chain reconciliation.

No state transition may erase recipient, amount units, fee units, total units, sender, approval hash, transfer hash, or receipt context unless the user explicitly starts a new transaction.

## Legal State Invariants

The reducer must reject contradictory state vectors.

| Invariant | Rule |
| --- | --- |
| Preview ready requires valid route and amount | `executionState = PREVIEW_READY` requires route availability `AVAILABLE`, route validity `VALID`, network support `SUPPORTED`, token support `SUPPORTED`, amount validity `VALID`, and no terminal receipt for the active intent. |
| Execution ready requires all fund-moving gates | `executionState = EXECUTION_READY` requires every `PREVIEW_READY` condition plus expanded view, connected sender, funding `SUFFICIENT`, and current preflight facts. |
| Fund-moving requests require funding | `APPROVAL_REQUESTED` and `TRANSFER_REQUESTED` require `fundingState = SUFFICIENT`. |
| Approval pending requires approval hash | `APPROVAL_PENDING` requires `approvalHash` for the active intent. |
| Transfer pending requires transfer hash | `TRANSFER_PENDING` and `RECONCILING` require `transferHash` for the active intent. |
| Confirmed requires successful receipt | `CONFIRMED` requires `transferHash`, successful on-chain receipt, and `receiptState = FINAL`. |
| Receipt finality is execution finality | `receiptState = FINAL` requires execution `CONFIRMED`, `FAILED`, or `INTERRUPTED`. |
| Invalid route cannot start execution | route validity `INVALID` forbids `PREVIEW_READY`, `EXECUTION_READY`, `APPROVAL_REQUESTED`, `APPROVAL_PENDING`, `APPROVAL_CONFIRMED`, `TRANSFER_REQUESTED`, and `TRANSFER_PENDING` unless those states belong to a prior immutable receipt, not the active intent. |
| Invalid amount cannot start execution | amount validity other than `VALID` forbids `PREVIEW_READY`, `EXECUTION_READY`, `APPROVAL_REQUESTED`, `TRANSFER_REQUESTED`, and new fund-moving writes. |
| Unsupported network/token cannot execute | network support or token support `UNSUPPORTED` forbids new fund-moving writes. |
| Broadcast facts survive form changes | after `transferHash` exists, later form invalidity must not erase amount, recipient, fee, total, hash, receipt, or execution facts for that intent. |
| Collapsed cannot initiate execution | `viewState = COLLAPSED` forbids wallet connection, approval request, and transfer request initiation. |
| Active intent is unique | only one active execution intent may accept mutating async events at a time. |

## Rendering Precedence

When multiple axes contain displayable information, one selector must compute the primary status, CTA, body/result presentation, and error display from the full state vector. Individual callbacks must never choose visible copy directly.

Primary status precedence:

1. `CONFIRMED` or `RECONCILING` execution state
2. active approval/transfer execution state
3. deterministic execution failure or interruption
4. route failure
5. wallet/network blocker
6. funding blocker
7. amount validation
8. idle/ready instruction

CTA precedence:

1. no fund-moving CTA in collapsed mode; show expand only
2. terminal confirmed: no fund-moving CTA; optional new transaction if product allows
3. reconciliation or pending execution: disabled active CTA
4. retryable execution failure/interruption: retry CTA
5. route/form/funding blocker: disabled CTA with blocker-specific accessible label
6. wallet disconnected: connect CTA
7. wrong network: switch network CTA
8. ready and connected: approve/transfer CTA

Body/result precedence:

1. confirmed receipt/result
2. reconciliation facts
3. active execution facts
4. retryable failure/interruption facts
5. route or source error
6. editable transaction form

Execution facts must not be visually replaced by lower-priority wallet, network, funding, or form conditions after approval or transfer has been requested.

## Visibility Rules

Structural regions remain visible in every rendered card state:

- issuer/product identity
- route/network/token summary
- fixed status region
- expand/collapse control when applicable

Workflow content changes inside reserved regions only. Panels must not use content-driven exterior height.

The current implementation violates this by hiding `.cc-card-action` in `CONFIRMED`, `TX_FAILED`, and `REVOKED`, and by showing only one body panel through CSS `display` rules tied to a single `data-state`. The target implementation may hide controls visually, but the action/status region geometry must remain reserved.

## Controls

| Control | Enabled when | Disabled when |
| --- | --- | --- |
| Expand/collapse | all states unless a documented wallet or accessibility defect requires disabling | never due only to transaction progress |
| Amount input | route availability `AVAILABLE`, route validity `VALID`, execution idle/preview-ready/execution-ready, not terminal | pending approval, pending transfer, confirmed, route unavailable |
| Execute chip/CTA | expanded view, amount validity `VALID`, route availability `AVAILABLE`, route validity `VALID`, network and token supported, funding sufficient, execution `EXECUTION_READY` | collapsed view, invalid amount, unsupported route, insufficient funding, pending wallet prompt, terminal confirmed |
| Retry | failed/interrupted states with retryable error | confirmed, non-retryable revoked/unsupported route |
| Explorer link | transfer hash known | no transfer hash |

Controls must have deterministic labels from the state matrix.

## Collapse And Expand

- Never automatically collapse because transaction state changes.
- Never automatically expand because an error occurs.
- Preserve values and transaction state across view changes.
- Preserve intended focus when possible; if the focused control is hidden in collapsed mode, restore it when expanded.
- Preserve internal scroll positions for any explicitly scrollable region.
- Collapsed mode must include a fixed status region that can represent every execution state.
- The expand/collapse control remains in the same location for every applicable state.
- Execution may continue while collapsed if the user already initiated it.
- A wallet prompt must not be opened by collapse/expand.
- Collapsed geometry is an acceptance/trust mark. Its only initiating interaction is expansion.
- Collapsed mode cannot initiate wallet connection, approval, or transfer.

## Input Contracts

### Amount Input

Use `type="text"` with `inputmode="decimal"`. Do not use `type="number"` for the authoritative input, because browser number inputs admit implementation-specific forms such as exponent notation and hide lexical intent.

Lexical grammar:

```text
completeAmount = digits ["." 1*6DIGIT]
temporaryAmount = "" | "." | digits "."
digits = 1*DIGIT
```

Accepted temporary editing values:

- empty string -> `amountTextState = EMPTY`
- `.` -> `TEMPORARY_INCOMPLETE`
- `1.` -> `TEMPORARY_INCOMPLETE`

Accepted complete values:

- `.5` is accepted by normalizing to `0.5` before parsing.
- `0.5`, `1`, `1.0`, `1.000000`, `0001.00` are accepted.
- leading zeros are accepted and normalized for display.
- pasted leading/trailing whitespace is trimmed before validation.

Rejected values:

- embedded whitespace -> `INVALID_CHARACTER`
- commas -> `INVALID_CHARACTER`
- `+1` -> `INVALID_CHARACTER`
- `-1` -> `INVALID_CHARACTER`
- `1e3` or any scientific notation -> `INVALID_CHARACTER`
- more than one decimal point -> `INVALID_CHARACTER`
- more than 6 fractional digits -> `EXCESS_PRECISION`
- more than 32 characters after trimming -> `INVALID_CHARACTER` (PROPOSED UI guard; not a contract/product maximum)
- below contract/product minimum -> `BELOW_MINIMUM`
- above product maximum -> `ABOVE_MAXIMUM` only when `maximumAmountUnits` is configured
- not divisible by contract `transferPrecision` -> `PRECISION_MISMATCH`

Normalization:

- trim pasted leading/trailing whitespace
- normalize `.5` to `0.5`
- parse directly from string to integer micro-USDC units
- do not parse through `Number` or `parseFloat`
- do not format and reparse for transaction math

Amount bounds:

- `minimumAmountUnits` comes from the contract/product configuration.
- `maximumAmountUnits` is `null` unless a real product or contract maximum is configured.
- When `maximumAmountUnits = null`, the renderer must not produce `ABOVE_MAXIMUM`.
- The 32-character text limit is a proposed UI input guard only and must be reviewed before becoming a conformance rule.

Current gap: `card.js` uses `parseFloat(input.value)`, `toRawUsdc(floatVal)`, stores `amount`, `fee`, and `total` as numbers, and later converts display-number totals back into raw units. This is not acceptable for the contract.

### Recipient/Route Input

Accepted:

- valid EVM address for recipient
- supported chain ID
- supported token
- optional route source context

Rejected:

- empty recipient -> `UNAVAILABLE`
- malformed address -> `INVALID`
- unsupported chain/token -> `UNSUPPORTED`
- zero address or contract/token self-recipient where contract rejects it -> `INVALID`

Current registry-backed surfaces lock recipient from `/registry/coincards/<id>.json`. A stateless v1 surface may lock recipient from host-declared data. The visible label must distinguish route validation from identity verification.

## Output Contracts

| Output | Empty/default | Valid display | Invalid display | Overflow |
| --- | --- | --- | --- | --- |
| Amount | `—` or empty input placeholder `0.00` | exact integer-unit formatter | controlled state text | no wrap |
| Fee percent | `Fee 1.00%` when rate is 100 bps | integer-bps formatter | `Fee unavailable` | no wrap |
| Fee amount | `—` | derived from `feeUnits` | `—` | no wrap |
| Total | `—` | derived from `totalUnits` | `—` | no wrap |
| Recipient | `—` | middle-truncated address plus optional name | controlled route error | ellipsis/middle truncate |
| Network/token | `—` | `POLYGON / USDC` or approved enum | `UNSUPPORTED` | no wrap |
| Wallet status | `DISCONNECTED` | enum label | enum label | one-line ellipsis |
| Transaction status | `IDLE` | enum label from execution state | enum label from execution state | one-line ellipsis |
| Transaction hash | `—` | shortened hash linked to explorer | `—` | middle truncate |
| Error code | `—` | controlled code | controlled code | one line |
| Error explanation | `—` | short controlled copy | short controlled copy | max two lines |
| Retry availability | hidden/disabled | controlled label | controlled label | fixed control slot |

All output text must come from the state vector and canonical values.

Numeric formatter:

1. Input is integer micro-USDC units.
2. Split into whole units and six fractional digits.
3. Display at least two fractional digits.
4. Display additional fractional digits only through the final nonzero digit.
5. Display no more than six fractional digits.
6. Never use scientific notation.
7. Never round away a nonzero micro-USDC unit.

Examples:

| Units | Display |
| ---: | --- |
| `0` | `0.00 USDC` |
| `1000000` | `1.00 USDC` |
| `1100000` | `1.10 USDC` |
| `1000001` | `1.000001 USDC` |
| `10010` | `0.01001 USDC` |

Fee percent formatter:

1. Input is integer basis points.
2. Whole percent = `bps / 100`.
3. Fractional percent = `bps % 100`.
4. Display exactly two decimal places followed by `%`.

Examples: `100 -> 1.00%`, `25 -> 0.25%`, `5 -> 0.05%`, `0 -> 0.00%`.

## Math Contract

The Solidity contract is the fee authority:

```solidity
fee = (amount * feeBasisPoints) / 10000;
totalDebit = amount + fee;
```

This is integer floor division. The contract also enforces:

- recipient is not zero address
- recipient is not the transfer contract
- recipient is not the USDC token contract
- amount is greater than or equal to `minTransferAmount`
- amount satisfies `amount % transferPrecision == 0`

The JavaScript display and submission path must follow:

```text
amountString -> amountUnits
amountUnits -> feeUnits
amountUnits + feeUnits -> totalUnits

amountUnits -> display amount
feeUnits -> display fee
totalUnits -> display total
amountUnits -> transferWithFee amount
totalUnits -> approve amount
```

Invariants:

- Use integer USDC base units (`BigInt`) for amount, fee, and total.
- Parse USDC strings into six-decimal units without floating-point arithmetic.
- Use one canonical calculation function for fee and total.
- Display values and submitted values derive from the same integer results.
- Never independently calculate display fee and submitted fee.
- Never format a value and parse it back for transaction math.
- Preserve trailing zeros according to the output contract, not by reparsing display strings.

Current implementation:

- `ix-execution.js` calculates fee as integer BigInt floor division, matching the contract.
- `ix-execution.js` still exposes `toRawUsdc(floatVal)`, which rounds `floatVal * 1e6`; that is not acceptable as the primary parser.
- `card.js` converts BigInt fee/total back to `Number` for state and display.
- `wallet.js` has a stronger `formatUsdcRaw(raw, decimals)` display helper and uses `calculateFee(rawAmount, chainId)`, but Coin Card must still converge on one shared integer parser/calculator.

## Error Presentation

Every error must map to:

- `errorCode`
- `errorTitle`
- `errorMessage`
- `retryable`
- `recommendedAction`
- `fundsMoved`
- `receiptState`

No generic "show an error somewhere" behavior is allowed. Collapsed and expanded mode both reserve status/error presentation regions.

## Asynchronous Callback Rules

Asynchronous callbacks may only request state transitions:

- manifest fetch resolved/rejected
- wallet connection resolved/rejected
- chain switch resolved/rejected
- approval hash received
- approval receipt confirmed/rejected/timed out
- transfer hash received
- transfer receipt confirmed/rejected/timed out
- parent `postMessage`
- receipt reconciliation

Callbacks must not directly change geometry, hide unrelated regions, erase values, or bypass the state transition table.

Every execution attempt must have an immutable `intentId` or `operationId`. The ID is created before approval or transfer can be requested and is stored with the parsed route, amount units, fee units, total units, sender, chain, token, and timestamps.

Async events must carry the active ID:

- wallet approval result
- approval receipt
- transfer result
- transfer receipt
- receipt reconciliation
- timeout/error classification

The reducer must reject any async event whose ID does not match the active intent. Rejected late events may update archived receipt reconciliation only if they match a stored receipt, but they must not mutate the active transaction display.

## Reset And New Transaction

An explicit reset/new-transaction action must:

- create a new `intentId`
- invalidate pending async events for the previous active intent
- clear editable amount text
- clear amount units, fee units, and total units for the new intent
- preserve locked route fields unless the user explicitly changes route source
- preserve wallet connection state if the wallet is still connected
- re-read allowance, balance, gas readiness, and network state before the next fund-moving request
- preserve the previous receipt in receipt history and keep it accessible
- preserve view state unless the user explicitly changes view
- return focus to the amount input when expanded and editable
- never overwrite confirmed transaction evidence

Reset must not delete approval hash, transfer hash, receipt facts, or proof context belonging to a prior finalized intent.

## Machine-Enforcement Path

Rules should move downward into enforceable layers:

| Rule type | Target enforcement |
| --- | --- |
| ownership and forbidden dependencies | `coin-card.artifact.json` plus architecture validator |
| implementation regions, selectors, lifecycle states | `coin-card.structure/v*.json` plus architecture validator |
| exterior dimensions, slots, overflow, asset checksums | `coin-card.tokens.json`, generated CSS, geometry tests |
| state axes, legal combinations, rendering precedence | future state contract JSON plus deterministic renderer tests |
| amount grammar and integer math | shared parser/calculator tests |
| async correlation and reset behavior | reducer tests |
| visual conformance | deterministic review surface plus screenshot tests |

Until those rules are machine-enforced, this document is a draft specification and audit artifact, not the final authority.

## Current Structural Inconsistencies

- Live card has no canonical fixed outer width/height.
- Live card uses content-driven height through `auto` grid rows and panel contents.
- Single `state.current` mixes route, amount, wallet, network, execution, terminal, and manifest error state.
- Amount validation lacks explicit invalid-character, excess-precision, below-minimum, above-maximum, and insufficient-balance states.
- `AMOUNT_READY` immediately transitions to `TRANSFER_INTENT_READY`, making it effectively transient.
- `ERROR` hides the card shell, violating the identity-shell persistence rule for card-level errors.
- `.cc-card-action` disappears in terminal/error/revoked states instead of reserving the action/status plane.
- `ccSelfSendWarn.is-active` can add content height.
- `locked` amount mode directly sets `style.display = 'none'` on the amount field.
- Status labels are set imperatively in multiple handlers.
- Chip classes are set imperatively in multiple handlers.
- Display labels and state transitions are distributed across callbacks.

## Current Calculation Inconsistencies

- `card.js` parses with `parseFloat`.
- `card.js` stores amount, fee, and total as `Number`.
- `card.js` displays values with `toFixed(2)` even when integer units may require up to six decimals.
- `card.js` converts `intent.total` back to raw units for approval.
- `wallet.js` and `card.js` have different display precision policies.
- Contract precision is not fully represented in Coin Card input validation.

## Proposed Implementation Order

1. Add deterministic review surface that can force every state vector without wallet calls.
2. Introduce a Coin Card state model module with independent axes.
3. Introduce canonical USDC string parser and formatter using integer units only.
4. Convert card rendering to `render(stateVector)`.
5. Replace CSS content-driven panels with fixed region slots.
6. Preserve action/status region geometry in every state.
7. Add screenshot/state tests against the deterministic review surface.
8. Move real wallet callbacks behind transition requests only.
9. Validate runtime against the invariant contract and state matrix before adding new product scope.
