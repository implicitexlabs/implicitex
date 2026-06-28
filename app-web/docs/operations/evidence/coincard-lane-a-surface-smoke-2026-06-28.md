# Coin Card Lane A — Surface Smoke
**Date:** 2026-06-28
**Surface:** implicitex.com/coincard/card-acceptance-lane-a.html
**Commit under test:** af52068 (fix: restore attribution state separation — collapsed owns left, expanded owns right zone)
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

## S2 — Collapsed Badge Composition

| Check | Expected | Result |
|---|---|---|
| "USDC accepted here" — primary, largest left element | Yes | |
| COIN CARD logo — directly below primary | Yes | |
| "Powered by [IMPLICITEX wordmark]" — below COIN CARD logo | Yes | |
| "POLYGON · USDC" — below Powered by | Yes | |
| ImplicitEx lettermark — upper right, fully within card bounds | Yes | |
| No "Powered by IMPLICITEX" in right zone when collapsed | Absent | |
| No duplicate COIN CARD logo or duplicate attribution | Absent | |

**Outcome:** PASS / FAIL

## S2b — Expanded Badge Composition

| Check | Expected | Result |
|---|---|---|
| Click badge — INSPECT panel opens | Yes | |
| "Powered by [wordmark]" disappears from left column | Yes | |
| Right zone shows: lettermark + "Powered by" + IMPLICITEX wordmark | Yes | |
| Left column retains: USDC accepted here / COIN CARD / POLYGON · USDC | Yes | |
| No "Powered by" in both left and right simultaneously | Confirmed | |

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
