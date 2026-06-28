# Coin Card Lane A — Surface Smoke
**Date:** 2026-06-28
**Surface:** implicitex.com/coincard/card-acceptance-lane-a.html
**Commit under test:** 2208f60 (footer: COIN CARD issuer mark links to coincard.implicitex.com with hover CTA)
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

## S2 — Footer Issuer Mark

| Check | Expected | Result |
|---|---|---|
| COIN CARD logo visible in INSPECT footer (lower left) | Yes | |
| Logo opacity consistent with muted tier | Yes (≈0.58) | |
| Logo is an anchor element | Yes | |
| Anchor `href` | `https://coincard.implicitex.com` | |
| Anchor opens in new tab | Yes (`target="_blank"`) | |
| No domain text (`implicitex.com`) in footer | Absent | |

**Outcome:** PASS / FAIL

---

## S3 — Hover CTA

| Check | Expected | Result |
|---|---|---|
| Hover over footer mark — logo disappears | Yes | |
| "Create your Coin Card" text appears on hover | Yes | |
| Text font | IBM Plex Mono | |
| Text weight | Medium (500) — visibly bolder than muted tier | |
| Text color on hover | Stepped up from muted (secondary tier) | |
| Mouse-off — logo reappears, CTA disappears | Yes | |
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
