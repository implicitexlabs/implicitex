# Coin Card Interaction Constitution

**Status:** Foundational governance document
**Created:** 2026-07-15
**Scope:** Coin Card interactions across present and future implementations

---

## Constitutional Charge

The Coin Card Interaction Constitution exists to preserve the integrity of the
Coin Card as a product across changing implementations, architectures,
technologies, and organizations. It governs how evidence, authority, decisions,
and commitments are revealed to people so that the product continues to help
strangers become willing to move money with informed confidence.

This constitution is intentionally more stable than the architectures,
contracts, and implementations that follow it. When those lower layers evolve,
they should evolve toward this constitution rather than requiring the
constitution to change.

This document exists because stronger system knowledge does not automatically
create clearer human understanding. Coin Card must preserve the difference
between what the system knows and what the user is trying to decide.

Three governing sentences anchor this constitution:

> The architecture exists to support the interaction model, not replace it.

> The system's knowledge exists to support the user's decision, not replace it.

> Trust is earned through evidence, not asserted by either party.

## Origin

This constitution emerged during the hardening of the Coin Card trust
architecture. As execution security, verification, lifecycle publication, and
authorization became stronger, the interaction simultaneously became more
difficult to understand.

That experience revealed a missing governance layer: one that defines how system
knowledge becomes human understanding without allowing implementation concerns to
replace the product conversation.

This constitution exists to prevent that separation from recurring.

## Design Thesis

Coin Card exists to reduce the cognitive cost of paying the correct recipient
with informed confidence.

It separates recipient authority from payer authority, exposes only the evidence
required for the current decision, and delays irreversible commitment until
sufficient evidence has been established.

Coin Card is not merely a webpage that can send USDC. It is a portable payment
identity. Its interaction must answer three human questions before money moves:

1. Who will receive my money?
2. Can I trust this destination?
3. What happens if I interact with this card?

## Scope

This constitution governs every interaction in which a Coin Card is presented,
inspected, trusted, prepared, authorized, executed, or settled, regardless of
implementation medium.

It applies equally to web, mobile, installed applications, NFC, QR interactions,
future hardware implementations, and any successor interfaces that preserve the
Coin Card model.

## Constitutional Guarantees

### 1. Authority has exactly one owner

Every authoritative fact has one authoritative source.

Never duplicate authority. If two modules appear to own the same fact, the
interaction is wrong.

### 2. Commitment follows evidence

Irreversible actions must always be preceded by sufficient evidence for the
user's current decision.

### 3. Conversation precedes control

The interface answers the user's next question before asking for the user's next
action.

Controls appear because the conversation requires them, not because the
implementation has reached them.

### 4. Trust is demonstrated, never requested

Coin Card never asks the user to trust it.

It presents evidence until trust becomes a reasonable conclusion.

### 5. Every state changes the conversation

If the interaction changes state, the user should understand why.

There must be no invisible state transitions and no silent escalation of
commitment.

## Interpretation Rule

When two lower-layer goals conflict, implementations shall preserve
constitutional guarantees before architectural convenience, architectural
correctness before presentation convenience, and user understanding before
implementation efficiency.

This rule governs conflicts such as:

- exposing system state because it is easy to expose
- reducing interaction steps in a way that compresses user judgment
- simplifying presentation in a way that obscures evidence
- preserving an implementation shortcut that weakens authority ownership
- accelerating commitment before the user has sufficient context

When in doubt, the implementation must move toward informed user judgment, not
toward internal convenience.

## Governing Principles

### Respect asymmetry

The merchant and the payer are not performing the same task.

The merchant publishes authority. The payer exercises judgment. Coin Card exists
to connect those two roles without confusing them.

This principle governs the product:

- The destination belongs to the Coin Card.
- The amount belongs to the payer.
- The wallet belongs to the payer.
- Sender evidence belongs to the wallet.
- Recipient authority belongs to the Coin Card.
- Trust belongs to neither party; it is earned through evidence.

### Conversations before controls

Interfaces exist to support the payer's and merchant's conversations, not to
expose internal system state.

### Evidence before commitment

Every irreversible commitment must be preceded by sufficient evidence for the
current decision.

### Evidence has an owner

Every visible fact must have one authoritative source.

Facts should not be shown merely because they are available. They should be
shown when their owner has established them and the user needs them.

### Commitment is explicit

The interaction must clearly distinguish:

- exploration
- preparation
- commitment
- execution
- settlement

The user should always know which phase they are in.

### Reveal progressively

Information should appear when it becomes meaningful, not merely because the
system has calculated it.

### Trust should be understandable

The user should not need to understand signatures, manifests, lifecycle
registries, authorization proofs, or provider continuity.

Those mechanisms exist to support trust, not to become the interaction.

### Preserve user agency

The system should never create the appearance of commitment before the user has
made one, nor obscure the consequences once commitment has been made.

## Anti-Principles

Coin Card must never optimize for the following, even if doing so might increase
short-term engagement, conversion, or implementation convenience.

### Coin Card must never pressure commitment

The interaction exists to support informed commitment, not accelerate payment.

### Coin Card must never substitute appearance for evidence

Visual confidence must always reflect actual evidence. Decorative trust signals
are prohibited.

### Coin Card must never expose implementation simply because it exists

Users should not be burdened with manifests, lifecycle bundles, cryptographic
algorithms, or execution proofs unless those concepts directly answer the user's
current question.

### Coin Card must never confuse authority

Every visible fact has one authoritative owner.

If two modules appear to own the same fact, the interaction is wrong.

### Coin Card must never ask for information before it becomes meaningful

Inputs should appear because the conversation requires them, not because the
implementation has reached them.

### Coin Card must never hide consequences after commitment

Once a user commits, the interaction must become more explicit, not less.

## Two Conversations

The merchant and payer begin from opposite directions and meet at the Coin Card.

### Merchant conversation

The merchant asks:

> How do I present my payment identity?

The merchant journey:

```text
Create
  -> Publish
  -> Present
  -> Receive
  -> Confirm
```

The merchant does not choose the amount being paid. The merchant publishes
authority.

### Payer conversation

The payer asks:

> Can I safely send money here?

The payer journey:

```text
Notice
  -> Understand
  -> Trust
  -> Connect
  -> Prepare
  -> Commit
  -> Receive confirmation
```

The payer does not publish authority. The payer exercises judgment.

## Evidence Ownership

Every visible fact must answer two questions:

1. What evidence established this?
2. Who owns that evidence?

| Evidence | Owner |
| --- | --- |
| Recipient identity | Coin Card |
| Recipient address | Coin Card |
| Card authenticity | Manifest signature |
| Current card validity | Lifecycle registry |
| Route / provider | Coin Card |
| Network requirement | Coin Card |
| Token requirement | Coin Card |
| Wallet provider | Wallet |
| Paying-from account | Wallet |
| Wallet network | Wallet |
| Wallet balance | Wallet |
| Amount | Payer |
| Fee calculation | Execution service |
| Total debit | Execution service |
| Authorization boundary | Execution service |
| Transaction request | Wallet |
| Transaction receipt | Blockchain |
| Settlement finality | Blockchain |

The destination is asserted by the signed Coin Card. The sender is evidenced by
the live wallet. Showing both reinforces the trust model; it does not duplicate
authority.

## Decision Hierarchy

Every transition must name the human decision being made.

| Transition | User decision | Evidence required | Commitment created |
| --- | --- | --- | --- |
| Present -> Discover | Is this worth noticing? | recognizable Coin Card identity | none |
| Discover -> Inspect | Is this worth examining? | recipient, route, basic trust signal | none |
| Inspect -> Trust | Do I believe this destination? | destination authority, authenticity, current validity | none |
| Trust -> Connect | Am I willing to reveal my wallet? | trusted destination and route | wallet visibility |
| Connect -> Prepare | Am I willing to prepare payment? | wallet account, network, balance | draft payment context |
| Prepare -> Ready | Do I agree with these numbers? | amount, fee, total, destination, sender | ready-to-commit intent |
| Ready -> Authorize | Do I intend to pay? | complete review of sender, destination, amount, consequences | execution authorization |
| Authorize -> Execute | May the system request wallet execution? | valid authorization and live wallet continuity | wallet transaction request |
| Execute -> Settled | Did money move, and where? | chain receipt | settlement record |

## Commitment Hierarchy

Not every transition is a commitment. The interaction must preserve the
difference between learning, preparing, committing, executing, and settling.

### Exploration

The user learns what the Coin Card is, who receives money, and whether the card
is worth inspecting. No wallet information is required.

### Preparation

The user supplies or permits evidence needed to evaluate payment: wallet,
network, balance, amount, fee, and total. The system may assemble a payment
context, but no irreversible action has occurred.

### Commitment

The user confirms intent to pay based on sufficient evidence. The system may
create one-shot execution authority. The user should understand that the next
phase may invoke wallet or chain action.

### Execution

The wallet and execution service perform approval, transfer, and confirmation
work. The interaction must become more explicit, not less.

### Settlement

The blockchain establishes the outcome. The user receives receipt evidence and a
clear final state.

## Constitutional Conformance

Every future Coin Card review must include a constitutional conformance section.

Each new interaction element or state transition must answer:

1. What question is the user asking?
2. What evidence answers it?
3. Who owns that evidence?
4. Why is this the correct moment to reveal it?
5. What decision does it enable?
6. What commitment, if any, follows?
7. Does this preserve all constitutional guarantees?
8. Only then: what should it look like?

An element that cannot answer these questions is premature, decorative,
misplaced, or outside the Coin Card interaction model.

## Governance Relationship

The Coin Card governance stack is:

```text
Mission
  -> Coin Card Interaction Constitution
  -> Interaction Architecture
  -> Trust Architecture
  -> State Architecture
  -> Presentation Contracts
  -> Implementation
```

The constitution answers:

> What must always remain true?

The architectures answer:

> How do those principles become a working system and journey?

The contracts answer:

> What must each module guarantee?

The implementations answer:

> How is one version built?

## Amendment History

Amendments should record why the constitution changed, not only what changed.

Each amendment must include:

- Problem observed
- Principle clarified
- Consequence if left unresolved
- Amendment adopted

### 2026-07-15 — Initial constitution

**Problem observed:** The Coin Card trust architecture matured while the
interaction became harder to understand. Stronger verification, lifecycle
publication, authorization, and provider-continuity guarantees were present, but
the product conversation became under-expressed.

**Principle clarified:** The system's knowledge exists to support the user's
decision, not replace it.

**Consequence if left unresolved:** Future implementations could continue
exposing engineering state or accelerating execution before the user had enough
evidence to make an informed commitment.

**Amendment adopted:** Established the Coin Card Interaction Constitution as the
governing layer between mission and architecture, with constitutional guarantees
for authority ownership, evidence-before-commitment, conversation-before-control,
demonstrated trust, and visible state meaning.
