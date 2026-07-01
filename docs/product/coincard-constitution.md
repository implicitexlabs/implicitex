# Coin Card — Constitution

**Date:** 2026-07-01
**Status:** Canonical. No implementation decision supersedes this document without an explicit revision.

---

> **Coin Card is not a widget.**
>
> Coin Card is a stateful payment credential with immutable structural zones
> and externally controlled execution surfaces.

---

## Core Principle

The Coin Card has two surfaces. These surfaces have distinct ownership and may
not trade responsibilities.

### Inside iframe — the credential

The embedded, protected Coin Card presentation:

- Branding and issuer identity
- Recipient identity
- Verified payment intent
- Amount / fee / total display
- Status states
- Confirmation and receipt surface

### Outside iframe — the execution layer

The host ImplicitEx page:

- Connect Wallet
- Sender wallet status
- Wallet and network handoff
- Actual transaction execution controls
- Portal-level routing and safety checks

The iframe publishes payment intent. The parent page executes it.
These responsibilities are not interchangeable.

---

## Required Structural Zones

The card has six immutable regions. Zones may resize within defined limits.
Zones may not trade places.

### Zone A — Brand / Issuer

- ImplicitEx X mark or Coin Card issuer mark
- Optional "COIN CARD" label
- Registry / status language
- Must never push transaction content downward unpredictably

### Zone B — Recipient Identity

- Recipient name or handle
- Verified wallet address
- Short address display
- Recipient status chip

### Zone C — Payment Intent

- Token / network
- Amount requested or amount input display
- Fee percentage
- Fee amount
- Total sender cost

### Zone D — Interaction State

- Input-ready indicators
- Pending / processing states
- Validation errors
- Disabled / locked state

### Zone E — Confirmation / Receipt

- Transaction hash
- Confirmed transfer state
- Explorer link
- Copy receipt / export proof packet controls

### Zone F — Footer / Trust Strip

- Non-custodial language
- Irreversible on-chain transfer warning
- Registry / version metadata

---

## Structural Invariants

The Coin Card skeleton must survive all state transitions.

### The following may change across states

- Visibility
- Opacity
- Emphasis
- Value contents
- Status indicators
- Enabled / disabled state

### The following may not change across states

- Zone ordering
- Zone ownership
- Card boundary
- Coordinate system
- Parent-child hierarchy
- Variable assignment

**Rule:** If a state transition requires moving an element into a different zone,
the transition is invalid and the architecture must be reconsidered — not
accommodated.

---

## States

### 1. Collapsed State

Purpose: compact verified identity preview.

**Visible:**

- Issuer mark
- Recipient identity
- Network / token
- Verification chip
- Expand affordance
- Minimal trust language

**Hidden:**

- Amount input
- Detailed fee breakdown
- Execution controls
- Receipt / export controls
- Long legal text

**Rules:**

- Logo stays in its assigned brand zone
- Recipient identity remains readable
- Card height is fixed or constrained
- Hidden elements must not collapse the structural grid in a way that moves
  visible zones unpredictably

---

### 2. Hover State

Purpose: signal interactivity without changing structure.

**Allowed changes:**

- Border emphasis
- Subtle glow / shadow
- Control highlight
- Expand affordance emphasis
- Status chip emphasis

**Forbidden changes:**

- Resizing card
- Moving logo
- Moving recipient identity
- Revealing major content
- Changing grid layout
- Causing text wrap that changes zone height

Hover should feel like "this card is alive," not "this card rearranged itself."

---

### 3. Expanded State

Purpose: show the full payment credential.

**Visible:**

- All collapsed-state identity elements
- Payment intent
- Fee breakdown
- Total
- Recipient verification details
- Trust / registry metadata

**Hidden:**

- Wallet connect button inside iframe
- Parent execution controls unless explicitly handed off
- Completed receipt controls unless transaction is complete

**Rules:**

- Expanded state uses the same zone order as collapsed
- Additional detail appears inside reserved regions
- No element appears outside the frame
- Overflow must be clipped or handled intentionally

---

### 4. Input / Interactive State

Purpose: user is preparing a transfer.

**Inside iframe:**

- Shows recipient
- Shows amount field or synced amount display
- Shows fee and total outputs
- Shows validation status
- Shows readiness state

**Outside iframe:**

- Connect Wallet
- Sender wallet identity
- Network switching
- Final execute / approve transaction controls

**Rules:**

- Iframe must not directly own wallet connection
- Parent page must pass wallet / network / readiness state into iframe
- Amount changes must update outputs without moving layout
- Errors must appear in a reserved error / status zone

---

### 5. Pending / Executing State

Purpose: transaction is in progress.

**Visible:**

- Processing status
- Tx pending message
- Wallet confirmation state
- Transaction hash when available
- Disabled inputs

**Hidden / disabled:**

- Editable amount input
- Duplicate execute action
- Layout controls

**Rules:**

- Execution status must not replace recipient identity
- Spinner / progress belongs in the interaction / status zone
- Card remains spatially stable

---

### 6. Confirmed State

Purpose: settlement proof.

**Visible:**

- Confirmed status
- Recipient
- Amount
- Fee
- Total
- Transaction hash
- Explorer link
- Copy receipt
- Export proof packet

**Rules:**

- Confirmation appears in receipt zone
- Transaction proof must be visually distinct from preparation state
- Confirmed state must be shareable and screenshot-safe

---

### 7. Error / Recovery State

Purpose: explain failure and allow safe retry.

**Visible:**

- Error type
- Human-readable recovery message
- Safe retry action outside iframe if wallet action is required
- Preserved recipient and payment intent

**Rules:**

- Never erase payment context
- Never show ambiguous failure
- Distinguish: wallet rejection / wrong network / insufficient balance /
  contract failure / unknown failure

---

## Inputs

| Input | Source |
|---|---|
| Amount | User entry |
| Recipient address / slug / card ID | Registry / manifest |
| Token / network | Registry / manifest |
| Sender wallet state | Parent page |
| Registry verification state | Registry / manifest |
| Fee basis points | Registry / manifest |
| Transaction lifecycle state | Chain / wallet provider |

**Input rules:**

- Recipient identity must come from trusted manifest / registry data
- User-entered amount must be validated
- Fee and total must be calculated from exact integer units, not floating point
- Input errors must display in a reserved zone

---

## Outputs

| Output | Requirement |
|---|---|
| Amount | Deterministic |
| Fee percentage | Deterministic |
| Fee amount | Deterministic |
| Total | Deterministic |
| Recipient address | From verified manifest |
| Network / token | From verified manifest |
| Transaction hash | From chain |
| Confirmation status | From chain |
| Receipt / proof packet data | From settled state |

**Output rules:**

- Outputs must be deterministic
- Same input must always produce same displayed fee / total
- No output may depend on visual layout state
- Display formatting must not alter business logic

---

## Branding Rules

### Inside iframe

- X mark may stand alone as issuer signal
- "COIN CARD" may appear as issuer / system label
- Avoid duplicate wordmark if it weakens hierarchy
- Brand zone remains fixed across all states
- Iframe must always signal that this is an ImplicitEx-issued payment credential

### Outside iframe

- ImplicitEx portal owns wallet connection
- Parent page owns transaction controls
- Parent page may frame the card as part of the larger transfer system

---

## Non-Negotiable Layout Rules

- No element may appear outside the card frame.
- No state change may move unrelated zones.
- Hidden elements must not cause layout collapse unless explicitly defined.
- Typography changes cannot alter card structure.
- Icon changes cannot alter card structure.
- Hover cannot change layout.
- Mobile defaults to stacked.
- Full desktop may support wider operational layouts.
- Every approved form factor must preserve variable parity.

---

## Testing Requirements

Every change must be checked against all states and contexts:

**States:**
- Collapsed
- Hover
- Expanded
- Input-ready
- Wallet-connected
- Pending
- Confirmed
- Error

**Contexts:**
- Mobile stacked
- Desktop standard
- Fullscreen / operations mode if supported

**The test question is always:**

> Did this change affect anything outside its authorized zone?

If yes: reject or revise.

---

## Architectural Evolution

Lane A is a successful V1 prototype. It proved the visual language, transaction
model, state progression, trust model, fee model, and user interaction pattern.

The production Coin Card architecture follows from this foundation:

```
Lane A (current)
  ↓  proved: visual language, transaction model, state progression,
     trust model, fee model, interaction pattern
Monolithic prototype
  ↓  writes: Constitution (this document)
Constitution written
  ↓  produces: zone audit, state machine formalization
Zone audit
  ↓  identifies: structural debt vs. working surface
State machine formalization
  ↓  specifies: explicit state names, transition rules, variable ownership
Iframe / parent separation
  ↓  implements: credential surface isolated from execution layer
Production Coin Card architecture
```

Lane A did not prove strict zone ownership, architectural isolation, or layout
invariance. Those are engineering refinements, not conceptual failures.

The Lane A smoke test proceeds on the current surface. The Constitution governs
what comes after it.
