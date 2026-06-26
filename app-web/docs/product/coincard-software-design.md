# Coin Card — Software Design and Interaction Philosophy

**Status:** Design foundation — pre-implementation  
**Date:** 2026-06-26  
**Session:** 2:00 AM — direction-setting, not speculative

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
| Dormant | Noticing | Breathing |
| Investigating | Reading | Explaining |
| Transacting | Acting | Assisting |

The card's job in each state is different. The transition between them should feel inevitable, not prompted.

### The core rule

**Coin Card never interrupts.**

- Watching a video: the video keeps playing
- Reading an article: the page never shifts
- Listening to a podcast: the audio never stops
- Hovering Coin Card: the experience expands locally

No navigation. No modal. No redirect. No popup. No wallet prompt until the user is ready.

This is the principle that separates Coin Card from every crypto widget in existence. Crypto widgets say: *Connect your wallet immediately.* Coin Card says: *Before you do anything, let me explain what this is.*

---

## The Dormant State

The dormant card must solve an unusual design problem: **how to communicate that this is interactive software without behaving like an advertisement.**

Most web components use one of two strategies:

- **Banner:** "Click me."
- **Application:** "Use me."

Coin Card attempts a third category: **"Investigate me."**

### Copy rotation

The dormant state rotates between two statements:

```
State A:  USDC ACCEPTED HERE
State B:  DIRECT USDC TRANSFERS
```

Timing:
- 8 seconds visible
- 1 second dissolve
- 8 seconds visible

The transition should be below conscious notice. The user should feel: *oh, this thing is alive* — not *I see a rotating banner*.

### Block animation

Left side of the card. A grid of blocks (approximately 24, arranged asymmetrically).

Every few seconds, 2–3 blocks alter opacity:

```
Before:   █ ░ ▒      After:   ▒ ░ █
          ▒ █ ░               █ ▒ ░
          ░ ▒ █               ░ █ ▒
```

**Rules:**
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

### What should NOT happen

- The card should not immediately expand
- The user should not be asked to connect a wallet
- Nothing should be demanded

### What should happen

The card sharpens. Incrementally. Over ~250ms:

1. Border contrast increases
2. Blocks briefly brighten
3. Typography sharpens slightly
4. A single affordance appears:

```
Explore transfer options →
```

Not a button. Not a CTA. Just an affordance — a directional signal.

After ~250ms, the card unfolds into the investigation state.

The cursor itself becomes the invitation. The user chose to approach. The card chose to respond.

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
