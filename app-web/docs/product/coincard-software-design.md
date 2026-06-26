# Coin Card — Software Design and Interaction Philosophy

**Status:** Design foundation — pre-implementation  
**Date:** 2026-06-26  

---

> **Coin Card does not seek attention. It waits to be invited.**

---

> *The Coin Card is never trying to get your attention. It is simply awake when you decide to give it your attention.*

---

## The Thesis

Coin Card is not a widget.

A widget is a UI component that does one small thing inside a larger experience. Coin Card is a **small piece of software with a constrained purpose and a strong interaction philosophy**. The difference is not technical — it is intentional.

The thesis in one sentence:

> A Coin Card is a portable, verifiable payment identity.

Not a wallet. Not a checkout. Not a crowdfunding page. Not a donate button.

It answers four questions and only four:

```
Who am I?
Where does the money go?
Is this destination authentic?
What state is this payment request currently in?
```

That is a surprisingly powerful primitive. Everything else is scope creep.

### Three products, one object

Coin Card contains three distinct products. Most crypto products build only the third.

**Coin Card as trust object**
> "Is this destination safe?"

**Coin Card as interaction software**
> "Let me understand this before I commit."

**Coin Card as transaction surface**
> "I am ready to act."

This is also the sequence in which trust is earned, not just the sequence in which states are entered. The right to ask for a wallet connection is earned by answering the first two questions first. Skip them and conversion fails — not because the technology is wrong, but because the trust architecture is inverted.

The implementation order in this document follows this sequence deliberately.

---

## The Oscilloscope Law

> **The card responds to observation. It does not solicit it.**

This is the governing design law for every interaction decision in Coin Card. It eliminates entire categories of options before they reach debate:

| Candidate behavior | Solicits or responds? | Decision |
|---|---|---|
| Pulsing border | Solicits | Rejected |
| Animated arrow on hover | Solicits | Rejected |
| Explanatory copy ("Hover to explore") | Solicits | Rejected |
| Block field opacity changes on cursor approach | Responds | Permitted |
| Border contrast increase on hover | Responds | Permitted |
| Copy appearing after 500ms of sustained attention | Responds | Permitted |

The name comes from the oscilloscope: you approach the instrument, you don't press anything, and it simply appears ready. It does not announce itself. It rewards the decision to look at it.

Any future design proposal that cannot pass this test — *is this soliciting attention or responding to it?* — does not belong in Coin Card.

### The placement principle

> The host content earns Coin Card.

This is not a layout rule. It is a product truth.

The correct sequence is: consume content → find it valuable → notice a trusted mechanism is available. In that order. The card appears after the user has already decided they care — not before.

This explains why the dormant state is a sign rather than software. Signs wait. They do not compete for attention with the thing they are adjacent to. The host content completes its thought first. Then the card is discovered.

Placement that violates this sequence — card before title, card before content, card before the user has oriented to the experience — does not fail because it looks wrong. It fails because it violates the moral order of the interface:

> First create value. Then provide a mechanism for exchange.

This is one of the oldest principles of commerce. Coin Card's placement logic is not a UX preference. It is an expression of that principle.

### The two laws

These two laws operate together. Every design decision in Coin Card is governed by one or both.

**Oscilloscope Law**
> The card responds to observation. It does not solicit it.

**Host Sovereignty Law**
> The card never interrupts the host experience.

The Oscilloscope Law governs the relationship between the card and the user.
The Host Sovereignty Law governs the relationship between the card and the page it inhabits.

A feature proposal that passes both laws belongs in Coin Card. A proposal that fails either does not.

---

## The iTunes Principle

The design reference for Coin Card is early iTunes — not as a visual reference but as a **philosophy of execution**.

Early iTunes was not revolutionary because it played MP3s. Plenty of software played MP3s. It felt revolutionary because every interaction communicated that someone had thought carefully about what should happen next:

- Buttons had clear states
- Transitions had weight
- Information hierarchy was obvious
- Errors were recoverable
- Everything felt consistent
- The software got out of the way of the user's intent

**The underlying asset was not the product. The quality of the intermediary experience was the product.**

Music existed before iTunes.  
Wallet addresses exist before Coin Card.

The value is not the asset being transferred. It is the quality of the surface through which it moves.

This principle governs every design decision in Coin Card:

> If a state transition has no weight, it is wrong.  
> If an interaction can be misread, it is wrong.  
> If the user has to think about the software, the software has failed.

---

## Competitive Reference: Rumble Wallet

**What Rumble does:** A self-custody wallet for creators to receive tips, payments, and direct transfers. Prioritizes Bitcoin, USDT, USDT-Gold, and USA₮. Network support spans Ethereum, Polygon, Arbitrum, TON, and TRON, though users never select chains directly.

**What Rumble is:** A wallet. It asks: *"How do I hold and move crypto?"*

**What Coin Card is:** An identity object. It asks: *"How do I know where to safely send crypto?"*

These are adjacent problems, not the same market.

### What to steal from Rumble

Not features. Principles.

**Self-custody language.** Rumble emphasizes: your keys, your money, your control, direct payment, no intermediary. That is psychologically powerful and directly applicable to Coin Card's trust model.

**Constrained launch.** Rumble did not launch with DeFi, NFTs, swaps, staking, charts, or derivatives. It launched with: receive, send, tip, withdraw. That is the right model. Coin Card's V1 should be equally narrow.

**Strong object identity.** A Rumble creator has one creator identity, one wallet identity, one destination. That maps precisely to the Coin Card model.

---

## The Distinction That Matters

| | Rumble | Coin Card |
|---|---|---|
| Primary object | Wallet | Identity |
| Core question | How do I hold value? | Where does value go safely? |
| User relationship | Account holder | Recipient record |
| Trust model | Self-custody | Registry-verified |
| Interaction model | Dashboard | Embedded surface |

Coin Card is not competing with Rumble. Coin Card is the trust layer that makes sending to any recipient — whether they use Rumble, MetaMask, or a hardware wallet — feel safe.

---

## Interaction Architecture

### The three-state model

```
DORMANT → INVESTIGATING → TRANSACTING
```

These are not UI states in the traditional sense. They are **user intent states**.

| State | User is doing | Card does |
|---|---|---|
| Dormant | Noticing | Waiting |
| Investigating | Reading | Explaining |
| Transacting | Acting | Assisting |

The card's job in each state is different. The transition between them should feel inevitable, not prompted.

### The Host Sovereignty Law

> **The card never interrupts the host experience.**

The host page remains sovereign. Coin Card is a guest inside someone else's experience.

- Watching a video: the video keeps playing
- Reading an article: the page never shifts
- Listening to a podcast: the audio never stops
- Hovering Coin Card: the experience expands locally, never globally

No navigation. No modal. No redirect. No popup. No wallet prompt until the user is ready.

This law explains every non-interruption decision in Coin Card: why hover expands in place, why the collapse is slow, why the block field stays active after attention is withdrawn, why the wallet button lives outside the iframe. The host content is always primary. Coin Card earns its place by never asserting itself above the experience it inhabits.

---

## The Dormant State

The dormant state does not communicate that the card is interactive.

That is not its job.

Its job is to communicate:

> This place is trustworthy. Something can happen here. I'll wait.

The decision to investigate belongs to the user. The card does not invite, prompt, or suggest. It waits. When the user chooses to look, the card responds. Not before.

This resolves what initially seemed like a design problem — *how to communicate interactivity without soliciting* — by eliminating the premise. The dormant state is not trying to communicate interactivity. It is communicating trustworthiness and availability. Interactivity reveals itself only when the user approaches.

A sign does not tell you to walk into the restaurant. It tells you: this is a restaurant. The decision to enter belongs to you.

---

Most web components use one of two strategies:

- **Banner:** "Click me."
- **Application:** "Use me."

Coin Card V1 is a third category: **a sign.**

> "This is a place where USDC transfers happen. The destination is verified. I'll be here."

### Copy rotation — locked

```
State A:   USDC ACCEPTED HERE
State B:   VERIFIED RECIPIENT
```

State A answers: *what happens here — location and asset.*
State B answers: *is this safe — trust and verification.*

No imperative. No verb in State B. "USDC" does not repeat in State B because State A already established it; the user reads them in sequence.

Rejected candidates:
- `SEND USDC` — imperative, solicits action (oscilloscope law)
- `TRANSFER WITH USDC` — imperative, solicits action
- `DIRECT USDC TRANSFERS` — answers *how it works*, which belongs in the investigation state, not the trust object
- `USDC TRANSFERS AVAILABLE` — "available" is weak; implies passive waiting, not active verification

Timing:
- 8 seconds visible
- 1 second dissolve
- 8 seconds visible

The transition should be below conscious notice. The user should feel: *this thing is alive* — not *I see a rotating banner*.

### Block animation

**Locked decisions:**

```
Count:              24
Position:           Upper left quadrant only — asymmetric, not centered
Update frequency:   3–8 seconds, randomized, never synchronized
Simultaneous:       1–3 blocks per change
Transition:         1.5–2.0 seconds per block change
```

Asymmetric placement is deliberate. Centered or symmetric reads as decoration. Off-center reads as data.

Every change: 1–3 blocks alter opacity values only.

```
Before:   █ ░ ▒      After:   ▒ ░ █
          ▒ █ ░               █ ▒ ░
          ░ ▒ █               ░ █ ▒
```

**Rules — no exceptions:**
- No translation
- No scaling
- No pulsing
- No movement whatsoever

**Only changing values.**

This is intentionally blockchain-like. State changes without physical displacement. The blocks are not decorative — they are a visual metaphor for the ledger: things change in value, not in position.

### The breathing edge

A 1px vertical line on the right side of the card.

- Resting: 30px tall, 20% opacity
- Every 10–15 seconds: expands to 2px wide, 40% opacity for ~300ms, returns

Not enough to announce itself. Enough to suggest: *there is another state available.*

This is an LED breathing. It communicates aliveness without demanding attention.

### Visual hierarchy in the dormant state

```
Primary     USDC ACCEPTED HERE
Secondary   COIN CARD
Ambient     [block grid — animated opacity values]
Tertiary    Powered by ImplicitEx
```

Note: **COIN CARD** is secondary, not primary. The user needs to understand the action before they learn the product name. Coin Card doesn't mean anything yet; USDC does.

---

## The Hover State

### Entry timeline

**0ms — cursor arrives**

Nothing expands. Nothing appears. The card acknowledges observation:

- Border contrast increases ~15%
- Block field becomes slightly more active (change frequency edges toward upper range)
- Background lifts ~2%
- Typography sharpens slightly

The card noticed. It does not announce this.

**500ms — sustained attention confirmed**

One line fades in. No verb. No instruction. A destination indicator:

```
USDC transfers →
```

The card has already said "USDC ACCEPTED HERE." The user knows the subject. The arrow points to more. The user decides whether to follow.

If "USDC transfers →" proves too spare in testing, the next least-intrusive alternative is:

```
Transfer details →
```

Try the arrow form first.

**800ms — user has decided to investigate**

The card unfolds into the investigation state.

The cursor is the invitation. The user chose to approach. The card chose to respond.

### Exit — attention withdrawn

The card does not immediately forget it was investigated.

- Collapse to dormant at **1.2× the entry duration** (a slightly slower return than the approach)
- Block field remains at elevated activity for **8–10 seconds** post-hover, then returns to base range
- No snap. No abrupt reset.

The slower collapse also serves a practical purpose: if the cursor drifts off accidentally, the user has a brief window to return without losing the investigation state.

### The law applied

Every element of the hover state passes the oscilloscope test:

- Border contrast increase: responds ✓
- Block activity increase: responds ✓  
- "USDC transfers →" appearing after 500ms: responds ✓
- Animated arrow flashing on cursor entry: solicits ✗ — not in Coin Card

---

## The Investigation State

The first expanded state **asks for nothing.**

No wallet prompt. No amount field. No connect button.

Instead:

```
USDC TRANSFERS

✓ Recipient Verified
✓ Polygon Network
✓ Settlement Available
✓ Transaction Protected

Explore Transfer →
```

The user hovers. They learn. Nothing is demanded.

This is the critical design moment. The user transitions from:

```
OBSERVER → INFORMED PARTICIPANT
```

Only after choosing to proceed does the card transition from informational object to transaction software.

The checklist items are not marketing copy. They are verifiable claims:

- **Recipient Verified** — registry manifest confirmed
- **Polygon Network** — chain ID confirmed
- **Settlement Available** — contract live, network operational
- **Transaction Protected** — fee structure disclosed, no hidden routing

If any of these cannot be confirmed, the item should not appear. The card only claims what it can prove.

---

## The Transaction State

When the user chooses to proceed, the card becomes active software.

This is where wallet connection happens — not before.

### The iframe and wallet shelf architecture

The card is an iframe. The wallet connection surface lives **outside** the iframe, immediately below it, in the host page.

**What the user perceives:**

```
┌─────────────────────────────────────────┐
│                                         │
│          COIN CARD                      │
│                                         │
│       USDC ACCEPTED HERE                │
│                                         │
│       ✓ Recipient Verified              │
│       ✓ Polygon Network                 │
│                                         │
├─────────────────────────────────────────┤
│            CONNECT WALLET               │
└─────────────────────────────────────────┘
```

**What is technically true:**

- The iframe ends at the horizontal rule
- The host page resumes below it
- The wallet button exists outside the iframe
- All background, border, spacing, and typography are visually coordinated

The user perceives one object. Two surfaces.

### Why this architecture is correct

**Wallet complexity stays out of the iframe.** No wallet listeners, signer initialization, provider polling, or injected provider discovery runs inside Coin Card. The iframe is presentation software, not wallet software.

**Dormant state is extremely lightweight.** When embedded on a page where no transfer is happening, Coin Card runs almost no JavaScript.

**No page reflow.** Because wallet controls live outside the iframe:
- Dormant card height is fixed
- Hover card height is fixed
- Investigation card height is fixed
- The wallet shelf never changes height

No content jumping. No YouTube video shifting. No article text moving around. This is a significant UX quality guarantee.

**The Connect Wallet button is machinery, not advertisement.** The card says: *here is what I am.* The button says: *here is how you use me.* Those are different jobs and they should live in different places.

### The threshold moment

```
State 1   User notices USDC ACCEPTED HERE
State 2   User hovers — card wakes up
State 3   User investigates — learns without committing
State 4   User sees CONNECT WALLET — decides to participate
```

The wallet button is the threshold between observer and participant. That threshold should feel significant. Not heavy — significant. The user knows they're about to do something real.

---

## Verified Payment Identity Object

What the card ultimately presents:

```
[ VERIFIED ]
OWNER:        Brandon Lehman
ASSET:        USDC
NETWORK:      POLYGON
STATUS:       ACTIVE
DESTINATION:  VERIFIED
REGISTRY:     IMPLICITEX
```

This is closer to a passport, a certificate, or a business card than it is to a payment form. It is a **credential object** that happens to also be a transaction surface.

The irony of this design approach: **the less Coin Card does, the more important every tiny interaction becomes.** When the surface is constrained, every hover state, every transition, every typography choice, every button press carries the full weight of the product.

That is the iTunes lesson applied to crypto.

---

## V1 Form Factor — Locked

> **A wide, dormant trust sign that appears only after the host content has completed its argument.**

This is the primary V1 form factor. It is not a donation widget, a payment embed, or a CTA button. It is a sign — in the oldest sense of that word. It marks a place where a thing can happen, after the user has already decided they care about the place.

**Compact** (286×172) remains available for contexts without video — pure article, link-in-bio, text-only pages — but it is a secondary form factor. Its primary risk is that right-floated rectangular bordered objects have been trained into the user's visual system as advertisement units for 25 years. That conditioning may override the design regardless of quality.

**Wide companion** (full-width, ~110px) below host content is the primary form factor. It has a natural reason to exist, arrives at the correct moment in the sequence, and reads as a sign rather than an interruption.

---

## What Coin Card is Not

To prevent scope creep, these are explicitly excluded from the design:

| Excluded | Reason |
|---|---|
| Wallet dashboard | Rumble does this. Coin Card is not a wallet. |
| Multi-chain selection | Complexity the user shouldn't see. One card = one chain. |
| Token selection | Same as above. One card = one token. |
| NFT support | Different product entirely. |
| Tipping flow | "Tip" implies patronage. Coin Card implies transfer. |
| Social features | Out of scope for the identity object model. |
| Fiat conversion | USDC only. Fiat is someone else's problem. |
| Iframe-based wallet connection | Security boundary. Wallet surface belongs to host layer. |

These are not "future considerations." They are outside the product thesis. A future product may do some of them. Coin Card does not.

---

## The Success Condition

Coin Card succeeds if, when someone encounters it embedded in a page:

1. They understand within 3 seconds that USDC transfers are accepted here
2. They can verify the recipient is legitimate before connecting their wallet
3. They complete a transfer without ever feeling like they were pushed
4. After the transfer, they feel the same way they felt after early iTunes: *that was exactly as smooth as it should have been*

That last criterion cannot be measured. It can only be built toward, interaction by interaction, state by state.

---

## Implementation Priority Order

When ready to build:

1. **Dormant state** — block grid, breathing edge, copy rotation
2. **Hover state** — sharpening, affordance appearance, 250ms delay
3. **Investigation state** — checklist display, no wallet demand
4. **Wallet shelf** — host-layer connect button, visual coordination with iframe
5. **Transaction state** — active transfer flow, state machine
6. **Transition quality** — timing, easing, weight of every state change

Do not start at step 4. The dormant state is the product. Everything else is machinery.

---

## Files

| File | Purpose |
|---|---|
| `docs/product/coincard.md` | V1 trust architecture and registry spec |
| `docs/product/widget-spec.md` | Redirect-shim widget (V1 distribution channel) |
| `docs/product/coincard-software-design.md` | This document — interaction philosophy and software design |
