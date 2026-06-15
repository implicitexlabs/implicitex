# LEARN — Design Brief

**ImplicitEx · Crypto Onboarding Center**

---

## What LEARN Is

LEARN is not a glossary. It is a crypto onboarding center — the bridge
between traditional finance users and crypto users.

A glossary defines terms. LEARN teaches people what they need to know to
use ImplicitEx confidently, starting from zero.

---

## Guiding Principle

> It costs nothing to educate. It can cost everything to assume.

Every assumption we make about what a user already knows is an opportunity
to lose them. A non-crypto user lands on ImplicitEx comparing it to PayPal,
Venmo, Cash App, or their bank. Their mental model is not wrong — it is
different. LEARN bridges that gap without requiring them to leave the site.

---

## The Critical Assumption to Address

**Users may assume they can create a wallet on ImplicitEx.**

This is the most important onboarding failure point. Non-crypto users
expect platforms to provide the tools needed to use the platform — because
PayPal, Venmo, Cash App, and banks all do. Crypto does not work that way.

LEARN must address this directly and early:

> Before you can use ImplicitEx, you'll need a wallet. ImplicitEx does not
> create wallets or hold funds. Here's how to get started.

---

## Site Architecture Role

Current six-page job hierarchy:

| Page | Job |
|---|---|
| Homepage | What is this? |
| FAQ | Quick product questions |
| Proof | Evidence and verification |
| Legal | Boundaries and disclaimers |
| Contact | Human help |
| **LEARN** | **Concepts, terminology, onboarding** |

LEARN is the seventh destination. It should eventually rank alongside Proof,
FAQ, Legal, and Contact as a primary footer link.

---

## Proof vs. LEARN Boundary

These are related but distinct jobs. Keep them separate as both sections grow.

| Question | Belongs in |
|---|---|
| What is USDC? | LEARN |
| Which USDC contract does ImplicitEx use? | Proof |
| What is Polygon? | LEARN |
| Which network does ImplicitEx operate on? | Proof |
| What is a wallet? | LEARN |
| Why does ImplicitEx never hold my funds? | Proof / Legal |

> Proof explains why the user should believe the claims.
> LEARN explains the concepts needed to understand the claims.

---

## FAQ Boundary

This boundary must be maintained as both pages grow.

**FAQ** — focused product questions:
- Why are there two wallet confirmations?
- Why does my wallet show a warning?
- Why Polygon? Why USDC?
- Why is the fee separate from gas?

**LEARN** — educational resources:
- What is a crypto wallet?
- How do I get one?
- Is this legal?
- What is the GENIUS Act?
- What is USDC?
- What is Polygon?

When a FAQ answer becomes a teaching resource, move it to LEARN and link
from FAQ. FAQ should stay short and product-specific.

---

## Three-Layer Architecture

### Layer 1 — Quick Definitions

Searchable. Alphabetical. One paragraph per entry.

**Search is essential here.** A user who types "gas" should immediately see:
> Gas is the network fee paid to Polygon validators to process transactions.
> ImplicitEx does not receive gas fees.

Initial candidates (content written after walkthrough confirms confusion):
- Address
- Approval (token allowance)
- Blockchain
- Gas
- MetaMask
- Network fee
- Non-custodial
- Polygon
- Private key
- Seed phrase
- Token
- USDC
- Wallet

---

### Layer 2 — First-Time User Guides

Narrative. Step-by-step where appropriate.

**Getting Started**
- What is a crypto wallet?
- How do I create a wallet?
- How do I fund a wallet with USDC?
- How do I install MetaMask?
- How do I connect my wallet to ImplicitEx?

**Using ImplicitEx**
- How do transfers work?
- Why are there two wallet confirmations?
- Why does my wallet show an "untrusted contract" warning?
- What fees am I paying?
- How do I verify that my transfer went through?
- What happens if I send to the wrong address?

---

### Layer 3 — Trust and Regulation

Trust questions that are neither product questions (FAQ) nor legal
disclaimers (Legal). These belong in LEARN because the goal is education,
not legal protection.

- Is crypto legal?
- What is USDC?
- Who issues USDC?
- What is the GENIUS Act?
- Why does ImplicitEx only support USDC?
- What protections do users have?
- How do I know this contract belongs to ImplicitEx?
- Is ImplicitEx safe to use?

---

## Page Structure (proposed)

```
[ Search LEARN ]

Popular Topics
--------------
What is a crypto wallet?
What is USDC?
What is Polygon?
What is gas?
How do I verify a transfer?

Getting Started
---------------
[Layer 2 guides — first-time user]

Using ImplicitEx
----------------
[Layer 2 guides — product-specific]

Trust & Regulation
------------------
[Layer 3 trust questions]

Quick Definitions
-----------------
[Layer 1 — alphabetical, searchable]
```

Search is the primary navigation for returning users and specific lookups.
Sections are the primary navigation for first-time users browsing.

---

## Concepts vs. Procedures

LEARN content falls into two distinct categories. Keep them separate.

**Concepts** — what something is:
- What is USDC?
- What is Polygon?
- What is gas?
- What is a wallet?

**Procedures** — what to do next:
- How do I create a wallet?
- How do I connect MetaMask?
- How do I verify a transaction on a block explorer?
- How do I send my first transfer?

Procedures tend to become more valuable than definitions over time. Most
users don't want a definition of a wallet — they want to be told what to
do next. When writing LEARN entries, prefer procedural framing where possible:

Bad: "A wallet is a software application that stores cryptographic keys..."
Good: "Before you can use ImplicitEx, you need a wallet. Here's how to get one."

The walkthrough will indicate whether procedural content is the more urgent
gap. Build what the evidence confirms.

---

## Content Sequencing Rule

**Do not write entries before the walkthrough.**

The walkthrough reveals which terms actually cause hesitation or abandonment.
Write those entries first. The candidate lists above are starting points,
not a writing queue.

After each tester session, log questions actually asked (verbatim) in the
walkthrough brief. Those become confirmed LEARN entries. Everything else
remains a candidate until confirmed by user behavior.

---

## Implementation Notes

- URL: `/learn.html` (or `/learn/` if multi-page)
- Footer: primary link alongside FAQ, Proof, Legal, Contact
- Inline: link terms from FAQ and homepage (e.g., "Send **USDC** on **Polygon**")
- Inline link pattern: one sentence on the source page, full explanation on LEARN
- Search: client-side is sufficient for MVP content volume
- Do not use "Glossary" (sounds like documentation) or "Terms" (collides with Terms of Service)
