# Coin Card — Badge Face Rebuild

**Date:** 2026-06-30
**Scope:** Variant 1 (Decal) badge face — visual hierarchy and recipient identity only
**Files changed:** `frontend/public/coincard/card-acceptance-lane-a.html`
**Execution logic:** unchanged

---

## Problem statement

The Variant 1 badge face did not pass the product clarity gate:

> Can a sender understand, authorize, execute, and verify a Coin Card transfer
> without private explanation?

Specific failures:

1. **Recipient identity absent from badge face.** Display name only appeared after
   INSPECT opened. A sender looking at the collapsed badge could not tell who they
   were paying.

2. **"Powered by" attribution appeared twice** — once in the copy block
   (`cc-badge-poweredby`) and once in the authority square (`cc-right-poweredby` +
   `cc-right-wordmark`). Neither instance had authority because they competed with
   each other.

3. **COIN CARD logo image occupied the hierarchy position where recipient identity
   should be.** A brand element sat where sender-relevant information belongs.

4. **Authority square "IMPLICITEX" text (12px Oxanium)** competed with the headline
   instead of deferring to it.

5. **Lettermark at 44px / 0.45 opacity** pushed the mark toward poster scale in a
   functional payment instrument.

---

## What changed

### CSS

| Property | Before | After |
|---|---|---|
| `.cc-badge--decal` `align-items` | `flex-start` | `stretch` (copy column fills height) |
| `.cc-badge--decal .cc-copy` `gap` | `8px` | `6px` |
| `.cc-badge--decal .cc-primary` `font-size` | `20px` | `18px` |
| `.cc-mark-wrap--decal` dimensions | `44×44px` | `36×36px` |
| `.cc-mark-wrap--decal .cc-mark-img` opacity | `0.45` | `0.30` |

New rules added:

- `.cc-recipient-name` — Oxanium 500, 13px, `--cc-text-secondary` (0.92 opacity)
- `.cc-attribution` — flex row, `gap: 5px`, `margin-top: auto` (pushes to bottom of copy column)

### HTML — Variant 1 badge copy block

**Removed:**
- `cc-badge-coincard` link (COIN CARD logo image + hover CTA)
- `cc-badge-poweredby` div (duplicate attribution)

**Added:**
- `<span class="cc-recipient-name" id="badge-recipient">—</span>` — receives `displayName` from manifest
- `<div class="cc-attribution">` — single "Powered by [wordmark]" line at bottom of copy block

### HTML — authority square

**Removed:**
- `<span class="cc-right-poweredby">Powered by</span>`
- `<span class="cc-right-wordmark">IMPLICITEX</span>`

**Result:** authority square contains lettermark only.

### JS — `applyVerified()`

Added recipient name population on manifest verify:

```js
const badgeRecipient = $('badge-recipient');
if (badgeRecipient) {
  badgeRecipient.textContent = manifest.displayName || abbrev(manifest.recipient);
}
```

---

## Badge face — new reading order

```
USDC accepted here          ← Oxanium 600, 18px — purpose
ImplicitEx Demo Treasury    ← Oxanium 500, 13px — who you are paying
POLYGON · USDC              ← IBM Plex Mono, 9px — network/token
[vertical space]
Powered by [wordmark]       ← IBM Plex Mono, 8px — attribution, bottom

                  [mark]    ← lettermark 36px / 0.30 opacity, right zone
```

---

## What did not change

- INSPECT panel, TRANSACT section, SETTLE section
- State machine transitions (BADGE → INSPECT → TRANSACT → SETTLE)
- Transfer math, BigInt debit calculation
- Approval flow, transfer flow, receipt logic
- Manifest fetch, validation, and JIT revalidation
- Variants 2 and 3 (deferred — Variant 1 is the operational surface)
- Contract ABI, contract addresses, chain config

---

## Verification

```
Contract tests:  59/59 pass
Static check:    1828 references clean
Execution logic: no diff
```

---

## What Variants 2 and 3 still need

**Variant 2 (Compact, 216×44px):** At this size, the card can carry either acceptance
message or recipient identity, not both. Recommended: keep "USDC accepted here" +
"POLYGON · USDC" only. Remove COIN CARD logo and compression artifacts. Defer until
Variant 1 smoke passes.

**Variant 3 (Feature Card, 380×188px):** Lettermark at 160×160px must be reduced to
~48px. Recipient name must be added. Same attribution treatment as Variant 1. Defer
until Variant 1 smoke passes.
