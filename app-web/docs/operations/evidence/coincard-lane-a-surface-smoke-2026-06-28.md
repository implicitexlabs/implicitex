# Coin Card Lane A — Surface Smoke
**Date:** 2026-06-28
**Surface:** implicitex.com/coincard/card-acceptance-lane-a.html
**Commit under test:** 00c7b62 (refine: COIN CARD logo to badge, boost contrast on evidence outputs, remove footer duplicate)
**Scope:** Surface regression only — footer link, hover CTA, visual integrity, card trust behavior.
**Not in scope:** Wallet connection, real USDC transfer (see coincard-lane-a-smoke-2026-06-27.md for wallet smoke).

---

## S1 — Page Load

| Check | Expected | Result |
|---|---|---|
| Page loads without console errors | Yes | |
| Card renders: BADGE visible | Yes | |
| INSPECT panel visible | Yes | |
| Fee display correct (1%) | Yes | |
| Total display correct | Yes | |
| Proceed button hidden until manifest VERIFIED | Yes | |

**Outcome:** PASS / FAIL

---

## S2 — Badge COIN CARD Lockup

| Check | Expected | Result |
|---|---|---|
| "USDC accepted here" visible as primary line | Yes | |
| COIN CARD logo visible directly below primary line | Yes | |
| Logo height visually larger than before (14px, was 9px) | Yes | |
| Logo opacity — clearly readable, not ghost-tier | Yes (≈0.72) | |
| No COIN CARD logo in the INSPECT panel footer | Absent (removed) | |
| INSPECT footer contains only the proceed button (right-aligned) | Yes | |
| POLYGON · USDC micro copy below COIN CARD logo | Yes | |
| ImplicitEx lettermark upper right — unchanged | Yes | |

**Outcome:** PASS / FAIL

---

## S3 — Hover CTA

| Check | Expected | Result |
|---|---|---|
| Hover over COIN CARD logo in badge — logo disappears | Yes | |
| `coincard.implicitex.com` URL text appears on hover | Yes | |
| Text font | IBM Plex Mono | |
| Text weight | Medium (500) | |
| Text color | Secondary tier (0.88) | |
| Mouse-off — logo reappears, URL text disappears | Yes | |
| Clicking logo opens coincard.implicitex.com in new tab | Yes | |
| Clicking logo does NOT open the INSPECT panel | Yes (stopPropagation) | |
| No layout shift during swap | Yes | |

**Outcome:** PASS / FAIL

---

## S4 — Keyboard / Accessibility

| Check | Expected | Result |
|---|---|---|
| Tab to footer mark — focus ring visible | Yes | |
| Focus-visible triggers CTA swap (same as hover) | Yes | |
| `aria-label` on anchor describes destination | Yes | |
| Logo `alt=""` (decorative, aria-hidden) | Yes | |

**Outcome:** PASS / FAIL

---

## S5 — Visual Regression

| Check | Expected | Result |
|---|---|---|
| Footer layout: logo left-aligned, proceed button right-aligned | Yes | |
| No overflow or clipping of logo at default card width | Yes | |
| No regression in card body copy tiers (muted / secondary / primary) | Yes | |
| No regression in BADGE → INSPECT transition | Yes | |

**Outcome:** PASS / FAIL

---

## Result

**Lane A surface smoke:** PASS / FAIL

**All checks PASS** confirms: footer issuer mark replaced domain text correctly; hover CTA works; no layout or trust behavior regression introduced by 2208f60.

**If FAIL:** Record finding below. Do not proceed to wallet smoke or Publisher MVP smoke until resolved.

Finding:
