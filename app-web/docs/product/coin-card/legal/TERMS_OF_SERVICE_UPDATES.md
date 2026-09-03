# Terms of Service — Coin Card Updates

**Derived from:** COIN_CARD_COMMERCIAL_SPEC_V1, REFUND_POLICY.md, PURCHASE_TERMS.md  
**Type:** Draft additions to terms.html — not a standalone document  
**Existing ToS last updated:** May 11, 2026

This document contains the five changes required to incorporate Coin Card into the existing Terms of Service. The existing sections covering the Transfer Portal remain unchanged unless noted.

---

## Change 1 — Update "Last updated" date

**Location:** Line 182 in terms.html  
**Current:** `Last updated: May 11, 2026`  
**New:** `Last updated: [DATE]`

---

## Change 2 — Add Coin Card section

**Location:** Insert after the "Platform Fee" section, before "Security and Reliability."

**Draft:**

### Coin Card

Coin Card is a named payment identity offered by ImplicitEx. Purchasing a Coin Card reserves a public handle — your address on the ImplicitEx network — and links it to the wallet address you provide at the time of purchase. Others can send USDC to your handle through the ImplicitEx Transfer Portal without needing your wallet address directly.

**Purchase.** A Coin Card costs $10.00 USD as a one-time purchase. There is no subscription and no renewal fee. The 1% platform fee described above applies to USDC transfers and is separate from the Coin Card purchase price.

**Duration.** Your Coin Card remains active indefinitely once purchased. ImplicitEx does not reclaim or deactivate active Coin Cards except at your request, following an eligible refund, or for violations of the Acceptable Use Policy.

**Handle reservation.** Your handle is reserved exclusively for your Coin Card while it is active. No other person can register the same handle while yours is in use. Handle availability is determined at checkout; ImplicitEx does not guarantee that any specific handle will be available at any given time.

**Refund.** Your first Coin Card purchase is covered by the ImplicitEx Coin Card 30-Day Satisfaction Guarantee. Full terms are described in the [Coin Card Refund Policy]. Eligible refunds return the full amount paid, including any applicable refundable taxes, to your original payment method.

**After a refund.** If a refund is approved, your Coin Card is deactivated as part of that approved transaction. A refund request alone does not deactivate your Coin Card. Your handle enters a limited recovery period during which it remains reserved and may be repurchased by you. After the recovery period, the handle returns to the public registry and may be registered by a new customer.

**Coin Card Purchase Terms.** Your Coin Card purchase is governed by the [Coin Card Purchase Terms], which are incorporated into these Terms by reference. In the event of a conflict between the Coin Card Purchase Terms and these Terms, the Coin Card Purchase Terms govern with respect to Coin Card purchases specifically.

**Non-transferable.** Coin Cards are personal payment identities and may not be transferred to another person or resold.

---

## Change 3 — Clarify Platform Fee scope

**Location:** End of the existing "Platform Fee" section.  
**Add the following sentence:**

> The 1% platform fee applies to USDC transfers executed through the Transfer Portal. It is separate from, and does not apply to, the one-time Coin Card purchase price.

---

## Change 4 — Extend Prohibited Conduct

**Location:** Add to the existing bulleted list under "Prohibited Conduct."  
**Add:**

- Register a Coin Card handle to impersonate another person or organization, commit identity fraud, or to squat a name with no intention of using it as a genuine payment identity.

---

## Change 5 — Extend Limitation of Liability

**Location:** Add a sentence to the end of the existing "Limitation of Liability" paragraph.  
**Add:**

> This limitation applies equally to Coin Card products, including but not limited to handle availability, card deactivation, handle recovery period duration, registry availability, and any changes to the Coin Card platform.

---

## Integration checklist

When incorporating these changes into terms.html:

- [ ] Update "Last updated" date to publication date
- [ ] Insert Coin Card section after Platform Fee section
- [ ] Add 1% fee scope clarifier to Platform Fee section
- [ ] Add Coin Card handle misuse to Prohibited Conduct list
- [ ] Add Coin Card liability sentence to Limitation of Liability
- [ ] Replace `[Coin Card Refund Policy]` with live hyperlink to refund policy page
- [ ] Replace `[Coin Card Purchase Terms]` with live hyperlink to purchase terms page
- [ ] **Resolve email conflict:** existing ToS uses `connect@implicitex.com`; Refund Policy and Purchase Terms use `support@implicitex.com`; the commercial spec locks `support@implicitex.com` as the single customer contact address. Update the existing ToS contact section to `support@implicitex.com` when applying these changes. Also update the `privacy.html` footer contact from `connect@` to `support@` at the same time.

---

*These updates do not alter any existing Transfer Portal terms. All additions are scoped to Coin Card.*
