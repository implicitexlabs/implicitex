# Brand Asset Placement

- SVG/PNG assets used directly by the web application belong in `app-web/frontend`.
- Editable brand source files (for example Adobe Illustrator `.ai`) belong in `docs/brand/source-assets`.
- User-facing product and brand name remains `ImplicitEx`.

---

## Lockup proportion rules

### Inline lockup (site header / nav)

Used on every page in the top navigation bar.

```
Lettermark:  29px  (mobile ≤480px: 28px)
Wordmark:   200px  (mobile ≤600px: 140px)
Gap:         11px
```

The inline lockup is the visual reference baseline. Its proportions are considered correct and balanced. All stacked lockup sizing is derived from this reference.

### Stacked lockup (about page hero, brand contexts)

**Rule: lettermark width = wordmark width ÷ 5 (1:5 ratio)**

```
Lettermark:  min(58px, 12.8vw)    ← lettermark/wordmark = 1:5 at every viewport
Wordmark:    min(288px, 64vw)
Gap:         calc(1rem + 20px)
```

- At desktop (≥450px viewport): lettermark = 58px, wordmark = 288px → 1:5 exactly
- At narrow viewports: both scale down together at the same rate, maintaining 1:5

### Design principle

> The mark introduces. The wordmark leads.

IMPLICITEX is the brand. The mark is the signal. In stacked contexts the mark is square and visually prominent — the 1:5 ratio counteracts that by keeping the mark subordinate to the wordmark.

Do not exceed a 1:4 ratio (lettermark:wordmark) without re-evaluating hierarchy. Below 1:6 the mark risks becoming unreadable at small sizes.

### Why the curves stay

Symbol = rounded paths (flow, systems, infrastructure). Wordmark = angular geometric forms (structure, precision). Do not introduce curves into the wordmark letters — the contrast is intentional.

### The implied X

The X-form is not drawn — it is constructed by the viewer. The stroke creates conditions for an X to be perceived without paths crossing. The delay is intentional: "implicit" = understood without being stated. Preserve this.
