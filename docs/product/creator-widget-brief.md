# Creator Widget — Product Brief

**ImplicitEx · Post-MVP Expansion · Layer 2**

Last updated: 2026-06-16

---

## What It Is

An embeddable USDC transfer interface that creators place on their own
websites, blogs, newsletters, podcasts, and creator pages.

A supporter clicks the widget, confirms an amount, and sends USDC directly
to the creator's wallet — using the wallet they already have. No account
creation. No platform registration. No ecosystem to join.

```
Creator Website
      ↓
ImplicitEx Widget
      ↓
USDC Transfer
      ↓
Creator's Wallet
```

---

## The Strategic Insight

People rarely wake up wanting a wallet.

They wake up wanting to support a creator, send a tip, contribute to a
newsletter, fund a podcast, or reward useful content. The creator is the
reason for the transaction. The wallet is the mechanism.

This means the creator widget is not a product feature — it is an
acquisition channel. Every creator who embeds the widget becomes a standing
distribution point. Supporters arrive at ImplicitEx through the creator,
not through advertising.

**The growth loop:**

```
Creators embed the widget
      ↓
Supporters use it
      ↓
Transfers generate a 1% fee
      ↓
Creator gets support
ImplicitEx gets transaction volume
      ↓
More creators embed the widget
```

This loop compounds. A direct-acquisition model (buy ads, attract strangers,
hope they need a transfer) does not.

---

## Why This Expansion, and Why Now

The transfer engine MVP answers one question: can a person reliably transfer
USDC? The creator widget depends entirely on that answer being yes.

Gate 4 (mainnet controlled smoke, 2026-06-15) confirmed the transfer path
works end-to-end. Once Gate 5 produces a stable, publicly accessible
transfer engine, the creator widget becomes the most natural first expansion:

- It uses infrastructure that already exists (the transfer engine, the fee
  model, the receipt lifecycle).
- It generates transaction volume without requiring ImplicitEx to acquire
  each user individually.
- It is a clear product with a clear user motivation — the clearest
  motivation in consumer software: "I want to support this person."

---

## Competitive Position

The direct comparison set is custodial, fiat-first creator monetization
tools: Buy Me a Coffee, Ko-fi, Patreon, PayPal.Me.

The ImplicitEx position is structurally different:

| | Custodial tools | ImplicitEx widget |
|---|---|---|
| Account required | Yes — creator and supporter | Wallet only — no account |
| Platform custody | Yes — platform holds funds | No — wallet-to-wallet |
| Fee model | 5–12% platform cut + payment processing | 1% flat, no platform account fee |
| Asset | Fiat (USD, GBP, EUR) | USDC — stable, on-chain, portable |
| Payout delay | Days (bank transfer) | Seconds (blockchain confirmation) |
| Lock-in | Platform-dependent | Non-custodial; creator owns their wallet |

The Rumble Wallet ad (June 2026) reinforces this position. Rumble's pitch is:
download our wallet, create an account, join our ecosystem. The ImplicitEx
version is: already have a wallet? Click support and send USDC.

Less friction. No ecosystem dependency. The emotional purchase is identical —
direct support for a creator — but the path is shorter and the funds arrive
without an intermediary holding them.

---

## Conceptual UI

These are not final designs. They document the intended interaction shape.

**Tip jar variant:**

```
Tip [Creator Name]
[ $5 ]  [ $10 ]  [ $25 ]  [ Custom ]
USDC · Polygon
Powered by ImplicitEx
```

**Campaign variant:**

```
Support [Campaign Name]
Goal: 500 USDC  ·  Raised: 312 USDC
[ Send $10 ]  [ Custom Amount ]
```

**Minimal variant (inline embed):**

```
[ Support with USDC ]
```

The widget should degrade gracefully — if the visitor has no wallet, it
should surface a short explanation and a path to LEARN or the main
ImplicitEx site rather than a dead state.

---

## Technical Preconditions

Do not begin widget development until all of these are true:

```
[ ] Gate 5 complete — transfer engine publicly accessible and stable
[ ] Transfer cap and fee model confirmed for production load
[ ] Receipt lifecycle verified reliable (no orphaned receipts in production)
[ ] At least one real non-builder user has completed a transfer
[ ] Widget embed architecture decided: iframe, script tag, or redirect flow
[ ] Creator wallet verification approach decided (display address vs. ENS vs. none)
```

The embed architecture decision is the most consequential early design
choice. An iframe is the simplest path but limits styling flexibility. A
script-tag widget gives creators more control but increases integration
complexity and XSS surface. A redirect flow (widget links to ImplicitEx with
pre-filled recipient) requires no embed at all and leverages the existing
transfer UI — worth evaluating first before building a standalone embed.

---

## Scope of Layer 2 (Widget Only)

Layer 2 is the embeddable widget. It is not the creator dashboard.

Do not design for analytics, supporter history, recurring support, or
campaign tracking until the widget ships and real transaction volume exists.
Building analytics infrastructure before there is data to analyze is
premature.

Layer 3 (creator dashboard) belongs in a separate brief, written after the
widget is in use.

---

## Open Questions

These are not blockers. They are decisions that must be made before
development starts.

1. **Embed architecture** — iframe, script tag, or redirect? Evaluate
   redirect flow first (lowest build cost, uses existing transfer UI).

2. **Creator onboarding** — how does a creator get a widget for their site?
   Self-serve via a generator page on ImplicitEx? Manual for launch?

3. **Fee passthrough** — does the 1% fee apply identically in widget
   context, or is there a creator-negotiated rate at scale?

4. **USDC-only or multi-asset?** — the transfer engine is USDC/Polygon-only.
   Does the widget inherit that constraint for launch, or does it wait for
   multi-chain support first?

5. **Wallet requirement for supporters** — the current model requires a
   wallet. Does the widget surface an onboarding path for supporters who
   don't have one yet, or is the assumption that creator audiences already
   hold crypto?

---

## Relationship to Other Roadmap Items

| Item | Relationship |
|---|---|
| Transfer engine (Layer 1) | Hard prerequisite — widget is built on top of it |
| LEARN | Relevant for supporter onboarding if wallet-less visitors hit the widget |
| Agent financial infrastructure | Separate strategic direction; do not conflate |
| Creator dashboard (Layer 3) | Follows Layer 2; do not design until widget data exists |

---

## Status

**Not started. Correctly deferred.**

The transfer engine must be proven stable under real public load before
widget development begins. Gate 5 completion is the trigger to open this
brief for active work.

Next action after Gate 5: revisit open questions above, decide embed
architecture, write Layer 2 technical spec.
