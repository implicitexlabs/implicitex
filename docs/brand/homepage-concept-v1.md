# Homepage Refinement Surface V1 — Elegant Utility Calibration

Date: 2026-07-04
Status: Refinement brief. Not an implementation patch.
Doctrine: `docs/brand/visual-doctrine-v1.md`

## Objective

Create one isolated refinement surface before any sitewide CSS sweep.

The refinement surface should preserve the current homepage architecture while
demonstrating corrected typography, spacing, alignment, and motion.

Internal design direction:

```text
Civilian Mission Control for Direct Settlement
```

This phrase is internal design direction, not recommended public headline copy.
Public copy should stay simpler and more literal.

The practical aesthetic target:

```text
Elegant utility: substantial capability presented with restraint, precision,
and confidence.
```

The homepage should not imitate xAI, SpaceX, X, Terafab, or any other company.
It should share only the deeper family traits of ambition stated plainly,
restraint, operational evidence, and visible proof that something real exists.

## Protected Architecture

Do not replace the current homepage structure in this phase.

Protected:

- rotating hero concept
- current black-and-gold identity
- Transfer Portal as central thesis and primary page object
- portal hierarchy and visual perimeter
- current content order unless a specific defect is documented
- existing evidence, verification, receipt, and status surfaces
- Coin Card's place in the broader system

Do not add:

- operational ticker crowding the Transfer Portal
- large decorative statistics around the portal
- new background texture by default
- broad font replacement
- sitewide radius reset
- invented metrics or visual scale theater

## First Viewport Refinement

The first viewport should establish mission and operational state.

The current rotating hero stays. The refinement question is whether the hero's
type scale, line height, spacing, fade timing, and slide stability feel
deliberate and calm.

Do not convert the hero into a different composition unless a specific
usability defect is documented.

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

## Operational State

Operational facts should exist, but they must not crowd the Transfer Portal or
compete with the hero.

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
- If facts create visual crowding near the Transfer Portal, reduce or relocate
  them rather than weakening the portal's perimeter.

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

The Transfer Portal does not need more objects around it. The surrounding page
needs enough restraint that the portal feels inevitable when the visitor reaches
it.

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

## Preserved Homepage Structure

```text
1. Mission / rotating hero
   Preserve concept. Refine typography, spacing, and motion.

2. Operational State
   Real current facts only. Do not crowd the portal.

3. Transfer Instrument
   Portal as primary page object. Protect perimeter.

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

The refinement passes if a first-time visitor can answer:

- What is ImplicitEx?
- Is it live or conceptual?
- What network and asset does it support?
- What does it cost?
- Does ImplicitEx custody funds?
- How can a transfer be verified?
- Where is the evidence?

The refinement also passes only if:

- the rotating hero remains recognizable as the existing ImplicitEx hero
- the Transfer Portal remains visually central and uncrowded
- typography roles are more consistent than before
- spacing hierarchy feels calmer and more deliberate
- motion feels smooth without becoming theatrical
- component states feel related across the page

The refinement fails if it mainly communicates:

- crypto startup aesthetics
- borrowed Musk-company identity
- vague futurism
- inflated scale
- decorative complexity
- trust claims without evidence
- homepage replacement rather than homepage refinement

## Non-Goals

Do not implement in this phase:

- sitewide CSS sweep
- new homepage deployment
- homepage architecture replacement
- new metrics dashboard
- fake operational counters
- multi-chain visual language
- token expansion language
- Coin Card marketing page

One isolated refinement surface first. Then evaluate.
