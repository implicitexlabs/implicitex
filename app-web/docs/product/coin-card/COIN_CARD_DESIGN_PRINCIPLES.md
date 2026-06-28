# Coin Card Design Principles

## Status

Normative subordinate design constitution.

## Authority

Inherits from:

```text
../IMPLICITEX_ARCHITECTURAL_PRINCIPLES.md
COIN_CARD_TRUST_MODEL.md
COIN_CARD_VERIFICATION_LANGUAGE.md
```

Authority chain:

```text
IMPLICITEX_ARCHITECTURAL_PRINCIPLES.md
        -> COIN_CARD_TRUST_MODEL.md
        -> COIN_CARD_DESIGN_PRINCIPLES.md
                -> composition decisions
                -> typography decisions
                -> contrast decisions
                -> branding hierarchy decisions
                -> evidence presentation decisions
                -> future Coin Card variants
                -> publisher-generated card surfaces
```

Nothing below this document may contradict it.
Nothing in this document may contradict the documents above it.

---

## Scope

This document governs how Coin Card surfaces present themselves visually and informationally.

It does not govern:

- what information is displayed (that is governed by COIN_CARD_TRUST_MODEL.md),
- what language is used (that is governed by COIN_CARD_VERIFICATION_LANGUAGE.md),
- what transfers execute (that is governed by contract and manifest),
- what the brand identity of ImplicitEx is (that is governed by the ImplicitEx brand system).

It governs only: how visual decisions are made, and by what criteria they are evaluated.

---

## Principle 0 — Organizational Authority

**A payment credential should look authoritative because it is well organized, not because it is heavily decorated.**

This is the governing constraint. All other principles in this document are corollaries.

Authority emerges from:

```text
clear information hierarchy
evidence visibility
typographic discipline
spacing
composition
explicit trust boundaries
legible uncertainty
```

Authority does not emerge from:

```text
ornament
visual effects
excessive branding
decorative complexity
implied trust signals
color emphasis without semantic justification
```

**Application:** When a design decision is in question, the test is not "does this look more impressive?" The test is "does this make the payment facts easier to read and trust?"

---

## Principle 1 — Evidence Legibility

Evidence outputs must be readable at a normal viewing distance without zoom, squinting, or visual effort.

Evidence outputs are:

```text
recipient name
destination address (truncated or full)
network and token
fee
total
connection state
verification status
uncertainty reason
settlement confirmation
transaction hash link
```

**The failure mode to prevent:**

> "If you know, you know."

A financial interface that requires prior knowledge to extract its evidence outputs has failed its users. Important things must look visually important.

**Implementation rule:** Functional text — any value a user must read to make a payment decision — must not fall below `rgba(242, 242, 240, 0.58)` opacity. Evidence outputs (amounts, addresses, status) should be in the `0.70`–`0.96` tier.

**The distinction:** Understated presentation and concealed information are not the same thing. Coin Card should be understated. It must not conceal.

---

## Principle 2 — Composition Hierarchy

Every Coin Card surface has a two-zone primary composition:

```text
upper left   = what this is (product identity and claim)
upper right  = who stands behind it (issuer authority mark)
```

### Left zone

The left zone states the payment claim and product identity in a fixed vertical order:

```text
Primary claim
        ↓
Product identity
        ↓
Supporting detail (network / token)
```

Current implementation:

```text
USDC accepted here      ← primary claim
COIN CARD               ← product identity (links to coincard.implicitex.com)
POLYGON · USDC          ← supporting detail
```

This order is not decorative. It reflects the semantic chain:

```text
What is being offered
        ↓
What system provides it
        ↓
What rails it runs on
```

### Right zone

The right zone contains the ImplicitEx authority mark.

Requirements:

- The ImplicitEx lettermark is the largest individual branded object on the card.
- The lettermark is centered above the wordmark where both appear.
- This composition is non-negotiable.
- No other brand element may appear in this zone.

The right zone functions as a seal, not an advertisement. It answers: "Who is accountable for this credential?"

---

## Principle 3 — Brand Singularity

Each brand element appears once per surface.

```text
COIN CARD logo      — once, in the left copy block
ImplicitEx mark     — once, upper right
ImplicitEx wordmark — once, either inline (compact) or paired with mark (full)
```

Duplication dilutes hierarchy. A second instance of any logo does not reinforce the brand — it creates a competing visual object.

**The specific prohibition:** The COIN CARD logo must not appear in both the badge copy block and the INSPECT panel footer. It belongs in the badge. The INSPECT panel footer is for operational controls (proceed button), not attribution.

---

## Principle 4 — Color Discipline

The Coin Card color system uses three semantic categories:

```text
Structure     — black, white, grayscale hierarchy (opacity tiers)
State         — amber (#D4A017), used only for verified/active/live conditions
Critical      — red, used only for revoked or failed conditions
```

Color must not be introduced as:

- decoration,
- emphasis outside a defined semantic category,
- a substitute for typographic or spatial hierarchy,
- a branding decision made at the Coin Card level independently of the ImplicitEx platform.

If color enters the system in the future, it enters through:

```text
ImplicitEx platform design language
        ↓
Coin Card design system
        ↓
specific card surfaces
```

Not the reverse. A card surface that introduces a new color creates a platform precedent it has no authority to set.

**Why the current system works:** When the only non-structural color is amber, amber means something. Amber means: this state is verified, this route is active, this transfer is live. That meaning is only preserved if amber appears nowhere else.

---

## Principle 5 — Typographic Discipline

The Coin Card typographic system has three functional tiers:

```text
Display / identity   — Oxanium (primary claims, amounts, status labels)
UI / operational     — Oxanium (buttons, controls)
Technical / evidence — IBM Plex Mono (addresses, hashes, amounts in mono, labels)
```

Weight and opacity are the primary hierarchy tools within each tier.

**Rules:**

- Amounts and destinations are technical evidence: IBM Plex Mono.
- Labels (Recipient, Network, Token) are functional metadata: IBM Plex Mono uppercase, muted tier.
- Primary claims ("USDC accepted here") are identity: Oxanium, primary tier.
- Buttons are operational: Oxanium, weight 600–700.

**The failure mode to prevent:** Reducing all text to the same opacity tier in pursuit of visual calm. The result is a card where nothing reads as more important than anything else — which is not calm, it is unintelligible.

---

## Principle 6 — Spacing as Hierarchy

Spatial grouping communicates semantic grouping.

Related evidence rows are tightly grouped. Sections are separated by thin borders (`rgba(255,255,255,0.06)`). The border is a divider, not a decoration — it signals a change in semantic category (identity rows → financial rows → action rows → proof rows).

Padding is uniform within a section and distinct between sections. The uniform inner safe area (`20px`) applies to all four sides of all card variants.

---

## Principle 7 — States Are Transitions, Not Decorations

The card has four states: BADGE, INSPECT, TRANSACT, SETTLE.

Each state transition is earned:

```text
BADGE      → default, passive presentation
INSPECT    → user-initiated, reveals credential facts
TRANSACT   → manifest-gated, requires verified route
SETTLE     → transfer-gated, requires confirmed transaction
```

Visual changes between states must reflect the semantic significance of the transition. TRANSACT compresses INSPECT — but may not erase it. SETTLE proves — it does not celebrate.

**The test:** Can the user, at any state, answer these questions without zooming or searching?

```text
Where is this money going?
How much will I send?
What does the system guarantee?
What does the system not guarantee?
```

If the answer to any of these requires visual effort, the state presentation has failed.

---

## Principle 8 — The Hover State Is Informational, Not Promotional

Interactive affordances on branded elements (e.g., the COIN CARD logo hover) should reveal information, not pitch a product.

```text
Correct:    coincard.implicitex.com   (where this system lives)
Incorrect:  Create your Coin Card    (promotional CTA)
```

The distinction: a user hovering over the COIN CARD logo is trying to understand what COIN CARD is, not being recruited. The hover state answers a question. It does not make an offer.

---

## Design Test

When evaluating any Coin Card design decision, apply this test in order:

```text
1. Is the evidence readable without zoom or effort?         (Principle 0, 1)
2. Does the composition follow the two-zone hierarchy?      (Principle 2)
3. Is each brand element present exactly once?             (Principle 3)
4. Does color appear only within defined semantic roles?    (Principle 4)
5. Is typography assigned to the correct tier?             (Principle 5)
6. Does spacing reflect semantic grouping?                 (Principle 6)
7. Does this state earn its visual weight?                 (Principle 7)
8. Are interactive affordances informational, not promotional? (Principle 8)
```

A design that passes all eight tests may still be wrong — but it is unlikely to be wrong in the ways that damage trust.

---

## Established Precedents

The following decisions are recorded as precedents, established through implementation and smoke evidence:

| Decision | Rationale | Commit |
|---|---|---|
| COIN CARD logo in badge copy block, not footer | Hierarchy: product identity belongs with the claim, not in attribution zone | 00c7b62 |
| ImplicitEx lettermark upper-right, largest element | Issuer authority mark; non-negotiable composition anchor | pre-00c7b62 |
| Amber used only for verified/active state | Color = semantic category, not emphasis | established |
| "coincard.implicitex.com" on hover, not "Create your Coin Card" | Hover is informational, not promotional | 00c7b62 |
| stopPropagation on COIN CARD logo click | Logo navigates; badge click opens INSPECT — two distinct interactions | 00c7b62 |
| No color adoption at card level before platform decision | Color enters system top-down | 00c7b62 |
