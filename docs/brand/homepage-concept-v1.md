# Homepage Concept V1 — Civilian Mission Control

Date: 2026-07-04
Status: Concept brief. Not an implementation patch.
Doctrine: `docs/brand/visual-doctrine-v1.md`

## Objective

Create one homepage concept before any sitewide CSS sweep.

The concept should make ImplicitEx feel like:

```text
Civilian Mission Control for Direct Settlement
```

This phrase is internal design direction, not recommended public headline copy.
Public copy should stay simpler and more literal.

The homepage should not imitate xAI, SpaceX, X, Terafab, or any other company.
It should share only the deeper family traits of ambition stated plainly,
restraint, operational evidence, and visible proof that something real exists.

## First Viewport

The first viewport should establish mission and operational state.

Do not begin with a friendly SaaS value prop. Do not begin with an oversized
marketing card. Do not begin with feature education.

Mission statement candidates:

```text
Move value directly.
No custodial balance.
No platform account.
Verified on-chain.
```

or:

```text
Infrastructure for direct digital settlement.
```

The mission voice should be human, monumental, and direct. It should not be
large Orbitron by default.

## Operational State Strip

Immediately below the mission, show only real operational facts.

Candidate facts:

```text
POLYGON · LIVE
USDC · ACTIVE
CONTRACT · VERIFIED
PLATFORM FEE · 1.00%
SYSTEM STATUS · OPERATIONAL
NON-CUSTODIAL · YES
```

Rules:

- Facts must be true and current.
- No vanity counters.
- No fake transaction volume.
- No placeholder partners.
- If a value cannot be verified or maintained, do not show it.

## Transfer Instrument

The Transfer Portal is the main physical object on the page.

It should feel like opening a control console:

- carefully constrained
- stateful
- readable
- unable to pretend something happened when it did not
- visibly connected to contract, network, fee, receipt, and verification state

The portal should retain the existing strengths:

- black restrained environment
- instrument-like modules
- numbered operational sections
- corner ticks
- monospaced data
- visible contract, network, receipt, status, and telemetry concepts

## Evidence Layer

After the instrument, show proof surfaces.

Purpose:

```text
Here is what happened. Verify it yourself.
```

Evidence modules:

- Contract address
- Fee model
- Source verification
- Last verified transaction or controlled smoke record
- Receipt model
- Coin Card evidence model
- Security / responsible disclosure
- Status and incident history

Avoid:

```text
Trust us.
Safe payments.
Approved recipients.
Bank-grade protection.
```

## Access Layer

Only after mission, operational state, instrument, and evidence should the page
explain who the system is for.

User groups:

- contractors
- creators
- families
- international collaborators
- small businesses
- donation/support pages
- websites preparing to embed Coin Card

The page should not lead with personas. It should establish that the system is
real, then show who can use it.

## Typography Plan

Three voices:

| Voice | Use |
|---|---|
| Mission voice | First-viewport statement and major public doctrine |
| System voice | Section numbers, operational labels, badges, short instrument headings |
| Machine voice | Addresses, hashes, amounts, blocks, receipts, status values |

Implementation implication:

- Do not use Orbitron for every major heading.
- Keep Orbitron for system labels and ceremonial proof.
- Use IBM Plex Mono for evidence.
- Use a neutral/human sans direction for the mission statement.

## Color Plan

Color should communicate state, not decoration.

- Gold: confirmation, verification, issuance, canonical registration.
- White/off-white: primary facts.
- Gray: labels and secondary context.
- Amber/red: advisory, warning, blocked, or critical state.
- Black: operational background.

No full-body decorative dot grid unless a specific instrument panel needs it.

## Homepage Structure

```text
1. Mission
   Large direct statement.

2. Operational State
   Real current facts only.

3. Transfer Instrument
   Portal as primary page object.

4. Evidence
   Contract, fee, source, receipt, Coin Card, status.

5. Access
   Who uses this and why.
```

## Copy Direction

Plain, declarative, evidence-first.

Examples:

```text
Here is the transaction system.
Here are its rules.
Here is the evidence.
Use it without surrendering control.
```

```text
Funds remain in the sender's wallet until the wallet signs and the transaction
settles on-chain.
```

```text
The recipient receives the displayed amount. The sender pays the 1.00% platform
fee separately.
```

```text
Receipts preserve what happened at transaction time.
```

## Acceptance Criteria

The concept passes if a first-time visitor can answer:

- What is ImplicitEx?
- Is it live or conceptual?
- What network and asset does it support?
- What does it cost?
- Does ImplicitEx custody funds?
- How can a transfer be verified?
- Where is the evidence?

The concept fails if it mainly communicates:

- crypto startup aesthetics
- borrowed Musk-company identity
- vague futurism
- inflated scale
- decorative complexity
- trust claims without evidence

## Non-Goals

Do not implement in this phase:

- sitewide CSS sweep
- new homepage deployment
- new metrics dashboard
- fake operational counters
- multi-chain visual language
- token expansion language
- Coin Card marketing page

One homepage concept first. Then evaluate.
