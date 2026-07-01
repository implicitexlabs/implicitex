# Coin Card — Product Tiers

Last updated: 2026-06-30

---

## Design principle

Tiers are not about features. They are about escalating trust, verification,
customization, and operational responsibility.

Each tier reflects a different relationship between ImplicitEx, the card holder,
and the transaction recipient. The custodial risk surface increases with tier.
Escrow and advanced settlement are explicitly deferred until legal review is complete.

---

## Custodial boundary

**ImplicitEx is non-custodial at every tier.**

> ImplicitEx verifies payment intent and records transfer proof; it does not
> custody funds, maintain user balances, or control user wallets.

This sentence governs all tier design decisions. If a proposed tier feature
requires ImplicitEx to hold, redirect, or independently move user funds — it
is out of scope until a separate compliance review authorizes it.

**What ImplicitEx may hold (non-custodial):**

- Domain name
- Email address (private, not published)
- Public wallet address
- Card slug / Card ID
- Registry status
- Display name, brand metadata
- Published verification history
- Receipt hashes and proof links

**What ImplicitEx must not hold (custodial or high-risk):**

- Private keys or seed phrases
- Signing authority over user wallets
- Smart-contract admin ability to redirect user payments
- Escrowed funds
- Pooled balances
- Off-chain user balances
- Ability to move funds without the user signing

**Avoid this language at every tier:**

- "We secure your funds"
- "We hold your payment"
- "Protected balance"
- "Everything you could get from a traditional bank"

**Use this language:**

- "Non-custodial"
- "Wallet-signed"
- "Sender-authorized"
- "On-chain transfer"
- "Verified recipient metadata"
- "Bank-grade clarity without bank custody"

---

## Tier 1 — Coin Card Free

**Purpose:** create surface area; make Coin Card a recognizable public primitive.

**Business purpose:** distribution, not revenue. This tier gets Coin Cards
embedded across the web so that senders recognize them and trust the format.

### What the host gets

- Basic Coin Card embed (iframe or JS widget)
- Recipient wallet address configured by the host
- Network and token displayed clearly to the sender
- Sender connects their own wallet and enters the amount
- Transaction fee on successful transfer (fee rate TBD — must reconcile with existing platform fee policy; default non-subscriber rate was 2.5%; Free tier rate requires deliberate pricing decision before launch)
- "Powered by ImplicitEx" attribution with link to coincard.implicitex.com

### What ImplicitEx does NOT provide at this tier

- Verified domain association
- Brand customization
- Analytics
- Receipt branding
- Registry status page
- No private account data retained beyond rate-limit/anti-abuse metadata

### Trust model

ImplicitEx owns **transaction trust** only — will the card honestly show where
funds go, execute correctly, and produce settlement proof?

ImplicitEx does NOT own **host trust** — does the sender trust the site/creator/project?
That is between the sender and the host. Coin Card Free makes no claim otherwise.

Correct card language:

> "Recipient wallet configured for this Coin Card"
> "Funds settle to the address shown"
> "Powered by ImplicitEx"

Forbidden card language:

> "Verified recipient"
> "[Name] verified"
> "Identity verified"

### Creation flow (current V1)

1. Host enters valid EVM wallet address
2. System validates address format
3. Caveat displayed: ImplicitEx does not verify wallet ownership
4. Host confirms
5. Card ID created (deduplication on wallet + config)
6. Host receives iframe embed code

### Anti-abuse (without gatekeeping)

- Address format validation
- Rate limits per IP
- Duplicate config resolves to existing card
- Blocklist for prohibited addresses
- Admin disable switch
- Budget alerts

---

## Tier 2 — Coin Card Registered

**Purpose:** verified payment identity; make the recipient look legitimate and
make payment instructions less ambiguous.

**Business purpose:** first meaningful subscription revenue; converts the card
holder from an anonymous embed user to a named, domain-bound recipient.

### What the host gets

- Custom card slug (e.g. `coincard.implicitex.com/yourname`)
- Domain association + verified domain badge
- Brand name and optional logo
- Canonical wallet address registry entry
- Revocation and update history
- Public status page
- Receipt / proof packet with Registered branding
- Basic analytics: card views, transfer starts, completed receipts
- Email address on file for support and status alerts
- "Last verified" timestamp on the card

### What this tier is NOT

- Not escrow
- Not fund custody
- Not account balance
- Not a bank account
- Not a guarantee of payment reversal

### Pricing model (target)

Annual subscription: $49–$99/year

For early testing: $99/year Registered Coin Card.

Cheap enough to create low friction; meaningful enough to demonstrate willingness
to pay and filter out non-serious holders.

### Trust statement for this tier

> "Your verified USDC receiving identity."

Not "banking." Not "merchant account." Not "hosted wallet."

ImplicitEx holds **identity and routing metadata**, not funds.

---

## Tier 3 — Coin Card Business

**Purpose:** operational crypto payment infrastructure for real businesses,
freelancers, creators, agencies, and vendors.

**Business purpose:** primary near-term revenue channel via setup fees; subsidizes
platform growth before transaction volume reaches sustainability threshold.

### What the host gets

- Multiple Coin Cards under one account
- Multiple receiving wallets by purpose (e.g. operations wallet, donations wallet)
- Branded receipt / proof packets
- Team / admin access (future)
- Webhook / API access (future)
- Website embed support with assisted setup
- Customer-facing payment pages
- Exportable transaction records
- Custom copy blocks: terms, refund policy, support contact, tax note
- Priority support
- Assisted setup by Aden Media Group

### Aden Media Group setup service (productized offer)

For hosts who want ImplicitEx to handle setup:

> "Here is your verified USDC payment page. Here is your proof receipt system.
> Here is your public trust page. We do not hold your funds. We do not control
> your website. Your wallet credentials never touch our system."

**Pricing target:**

- $299 setup + $29/month
- $750 setup + $19/month
- $1,500 "Business Trust Kit" for polished integrations requiring custom work

**Why this tier matters economically:**

At 1% transaction revenue, reaching $25,000/year requires $2.5M in transfer volume.

At $750/setup, reaching $25,000/year requires 33 Business Tier customers.

Setup revenue bridges the gap while platform volume grows.

---

## Tier 4 — Advanced Settlement (FUTURE)

**Status: EXPLICITLY DEFERRED. Do not build this in V1.**

**Gate condition:** this tier requires separate legal review, compliance assessment,
and jurisdiction-by-jurisdiction analysis before any feature is built.

What this tier might include someday:

- Conditional payment release (escrow)
- Dispute handling
- Pooled balances
- "We protect the payment" features

What changes at this tier:

- Regulatory surface area changes significantly
- Money-transmitter analysis is likely required
- Custody question is no longer academic

**Required language when discussing this tier externally:**

> "Future advanced settlement products may require additional compliance review
> and may not be available in all jurisdictions."

**Internal fence:** do not let Tier 4 concepts contaminate Tier 1–3 design,
copy, or legal language. The non-custodial posture of Tiers 1–3 must be preserved
independently of whether Tier 4 is ever built.

---

## Summary

| Tier | Name | Revenue model | Custodial? |
|------|------|---------------|------------|
| 1 | Free | Transaction fee (rate TBD) | No |
| 2 | Registered | Annual subscription | No |
| 3 | Business | Setup fee + monthly | No |
| 4 | Advanced Settlement | TBD — legal review required | Potentially yes |

---

## Target markets by tier

**Tier 1 — Free:**

- Anyone already publishing a public wallet address
- Open-source maintainers
- Personal websites
- Early experimenters

**Tier 2 — Registered:**

- Crypto-aware freelancers ("I accept USDC but sending a wallet address looks unprofessional")
- Independent creators with an audience
- Small agencies wanting clean payment proof
- Consultants with international clients

**Tier 3 — Business:**

- Small agencies / contractors who need branded receipts and export
- Web3-adjacent local businesses accepting stablecoin
- Small international vendors facing wire/processor friction
- Organizations wanting a professional payment surface without acquiring staff to manage it

---

## What ImplicitEx is not selling

At no tier does ImplicitEx sell:

- A faster way to send USDC (too generic)
- A bank alternative (regulatory trap)
- A custodial wallet (non-custodial posture)

ImplicitEx is selling:

> **The cleanest way to publish, verify, execute, and prove a USDC payment.**

That is the wedge. Every tier delivers a version of that sentence.
