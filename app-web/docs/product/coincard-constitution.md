# Coin Card Constitution

*Founding principles. Not implementation. Evaluate every future feature request against these.*

---

## I. A Coin Card represents one payment identity.

Not a payment page. Not a checkout link. Not a tipping jar.
An identity — a persistent, human-readable name attached to a real person or entity
that can receive value directly.

This distinction governs everything downstream.

---

## II. The recipient is never manually entered by the sender.

The entire point of a Coin Card is that the sender does not need to know — or copy, paste, or verify — a wallet address.
The card holds that information.
Any feature that reintroduces manual recipient entry undoes the core product.

---

## III. The URL is the identity. The wallet is the destination.

`coincard.click/yourname` never changes.
The wallet behind it can.
When a cardholder updates their wallet, every existing link continues to work.
This is what makes the URL a durable identity, not just a shortcut.

---

## IV. Every Coin Card has one authoritative owner.

One cardholder. One wallet. One account.
Multi-wallet, multi-owner, or shared-card configurations are not in scope.
They introduce ambiguity about who controls the identity, which undermines the product's core promise.

---

## V. The hosted page and the embedded widget are different expressions of the same identity.

The card at `coincard.click/yourname` and the Business embed on a cardholder's website
are not separate products.
They are the same identity presented in two contexts.
Both must reflect the same name, wallet, and status at all times.

---

## VI. Creator and Business differ by capabilities, not by trust or execution.

A Creator Coin Card and a Business Coin Card resolve to the same underlying transaction infrastructure.
The difference is distribution surface: Business unlocks the embeddable component.
There is no trust hierarchy between tiers. Neither is "more verified" than the other.
Feature gates live at the tier boundary. Trust lives at the protocol.

The internal decision rule:

- **Creator:** "I need a Coin Card link to share."
- **Business:** "I need Coin Card integrated into a website I operate."

Do not classify by occupation, audience size, or legal entity. A solo podcaster sharing a show-notes
link is a Creator customer. A podcast operation embedding Coin Card into its website is a Business
customer. The same person could be both at different points in time.

---

## VII. The card lifecycle has defined states. Outside those states, nothing exists.

```
Available → Requested → Approved → Provisioned → Live
                                                     ↓
                                               Deactivated (non-renewal)
                      ↓
               Rejected (not approved; username released after hold period)
                      ↓
               Abandoned (no action after expiry; username released)
```

A username that has not reached "Live" is not a Coin Card.
A username that has reached "Deactivated" is no longer a Coin Card.
The URL, the identity, and the cardholder's ownership are coupled to this lifecycle.

---

## VIII. ImplicitEx is the issuer. The cardholder is the identity. The sender is the audience.

This is the three-party model.

- ImplicitEx issues and operates the infrastructure.
- The cardholder owns the identity and controls the destination wallet.
- The sender interacts only with the card's public surface.

Features that blur these roles — letting senders configure anything, or letting ImplicitEx control the wallet destination — violate the model.

---

## IX. Coin Card is an ImplicitEx product and the front door to the wider ImplicitEx ecosystem.

Coin Card is a real product: people purchase it, manage it, share it, and distinguish it from the Portal.
It also has a role in the ecosystem: it is how most people first encounter ImplicitEx.

The discovery sequence is predictable:

1. Someone shares their Coin Card.
2. A sender asks: "Can I just send crypto directly?" → they find the Portal.
3. A business asks: "Can I embed this on my site?" → they find the Business tier.
4. A power user asks: "Can I analyze this wallet?" → they find Transfer Analysis.

Every decision about Coin Card's public surface — its copy, its brand, its UX —
should be evaluated against whether it strengthens both of these truths:
that Coin Card has enough identity and value to stand on its own,
and that every successful Coin Card strengthens ImplicitEx rather than competing with it.

---

## X. Non-custodial by design. Always.

ImplicitEx never holds, stores, or controls cardholder funds.
Funds move directly from sender to cardholder wallet.
This is not a legal hedge. It is the product's foundational architecture.
Any feature that routes funds through ImplicitEx infrastructure — even temporarily — violates this principle.

---

## XI. Coin Card minimizes cognitive load on the sender.

The sender never has to:

- remember a wallet address
- type a wallet address
- verify that they copied the right address
- ask for an updated address after the cardholder changes wallets

Every one of those eliminated burdens is a design decision, not a convenience feature.
Anything that reintroduces cognitive load on the sender — even slightly — works against the product's core purpose.

This principle explains why the recipient field doesn't exist on the send screen,
why the URL never changes, and why wallet updates are invisible to senders.

---

*Written 2026-07-20. Review at major architectural milestones.*
