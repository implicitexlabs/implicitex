# ImplicitEx Campaign Publication Checklist — Series A

**Status:** Pre-publication  
**Cards ranked and frozen:** 2026-07-04 (commit 7183dd5)  
**Opening question for next session:** How does a card move from `campaign/png/a1.png` to someone's Twitter feed?

---

## Phase 1 — Asset Freeze

- [ ] Confirm Series A card set is frozen (SVG masters + PNGs locked)
- [ ] Confirm S+/S publication order (see ranking in campaign-thesis.md)
- [ ] Verify all 10 PNGs rendered with Orbitron/Oxanium (Fontconfig registered)
- [ ] Run final pixel-level safe-area audit (`python3 render.py`)
- [ ] Confirm A7/A3/A10 revised copy is in the rendered set

**Publication order (S+ → S → A):**
```
Week 1:  A1  — USDC FOR WORK, NOT SPECULATION.
Week 2:  A2  — SEND DOLLARS. ANYWHERE.
Week 3:  A8  — YOUR WALLET. YOUR FUNDS. YOUR TRANSFER.
Week 4:  A9  — NO CUSTODIAL ACCOUNT REQUIRED.
Week 5:  A4  — ONE WALLET. ONE PAYMENT. ONE RECEIPT.
Week 6:  A6  — RECEIVE PAYMENT. VERIFY ON-CHAIN.
Week 7:  A7  — SUBMIT. EXECUTE. VERIFY.
Week 8:  A5  — KEEP PROJECT BUDGETS SEPARATE.
Week 9:  A3  — PAY CONTRACTORS. ANYWHERE.
```
A10 (CONTRACT. FEE. TRANSFER.) held for technical-audience series. A7/A3 stagger to avoid double VERIFY in the same week.

---

## Phase 2 — Account Preparation

- [ ] Review X (Twitter) profile bio — does it reflect current product state?
- [ ] Review X header image — consistent with campaign visual language?
- [ ] Identify website landing destination for each card's link
- [ ] Confirm implicitex.com is live and the landing page reflects the card copy
- [ ] Verify analytics / UTM parameter tracking is in place
- [ ] Pin supporting post or thread before first card drops

---

## Phase 3 — Publication Schedule

Each card should be a standalone post — not a thread, not a carousel.  
One card. One statement. No caption explaining what it means.  
The copy is the caption.

Optional: follow-up reply linking to the relevant proof surface (trust page, explorer, receipt demo).

---

## Phase 4 — Evidence Collection

Track per card, per week:

- [ ] Impressions
- [ ] Profile clicks
- [ ] Website visits from card link
- [ ] Wallet connects (if landing page has the instrument)
- [ ] Transfer attempts
- [ ] Completed transfers

Evidence collected here feeds Phase 5. A completed transfer that originates from a campaign impression is the first generated asset candidate.

---

## Phase 5 — Generated Asset Pipeline (Future)

Not blocking publication. Define while Series A runs.

- [ ] Define transaction event schema (what fields emit from a completed transfer)
- [ ] Define evidence artifact schema (what fields appear on a generated card)
- [ ] Build receipt → campaign artifact renderer (extends existing receipt engine)
- [ ] Define publication subscriber (what triggers a card export and post)

The pipeline:
```
Transfer occurs
      ↓
Receipt generated
      ↓
Campaign artifact generated
      ↓
Share card exported (1600×900, same pipeline as Series A)
      ↓
Social post published
```

A generated asset from a real transfer is the first card in Series B.  
It cannot be produced before the transfer happens.  
That constraint is the doctrine.

---

## Reference

- Campaign assets: `campaign/png/a1–a10.png`
- Visual philosophy: `docs/marketing/campaign-thesis.md`
- Operating doctrine: `docs/strategy/operating-doctrine.md`
- Build instructions: `campaign/README.md`
