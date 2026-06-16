# ImplicitEx — Design Reference

Type system, spacing, and visual conventions for the ImplicitEx web front-end.
Reference this document when adding new UI elements or pages.

---

## Font Families

Three families, each with a defined role. Do not swap roles.

| Token      | Family              | Role                                      |
|------------|---------------------|-------------------------------------------|
| `--display`| Orbitron            | Headings, labels, section kickers, badges |
| `--sans`   | Oxanium             | Body copy, paragraphs, UI text            |
| `--mono`   | IBM Plex Mono       | Metadata, addresses, nav elements, code   |

---

## Type Scale

### Tier 1 — Page title (h1)

Used once per page. The page's name, not a content heading.

```css
font-family: var(--display);
font-size: clamp(22px, 3vw, 32px);   /* 32px max */
font-weight: 700;
line-height: 1.15;
```

Previous value was `clamp(30px, 5vw, 52px)` — reduced June 2026 because
the 52px ceiling felt oversized relative to the body and section headings.

---

### Tier 2 — Section heading (h2)

Major divisions within a page. Sits clearly above body but well below the
page title.

```css
font-family: var(--display);
font-size: clamp(14px, 1.8vw, 18px);
font-weight: 700;
line-height: 1.15;
```

Exception: `policy-shell` currently uses `clamp(16px, 2vw, 22px)` — this
is the value in production and may be tightened in a future pass.

---

### Tier 3 — Section kicker / subheader  ← approved reference size

The 14px Orbitron uppercase label. This is the approved size for section
labels, card headers, module titles, and anything functioning as a named
category rather than prose. "HOW IT WORKS" on the index page is the
canonical example.

```css
font-family: var(--display);
font-size: 14px;
font-weight: 700;
letter-spacing: 0.14em;
text-transform: uppercase;
color: var(--white);
```

CSS class: `.section-kicker`
Also matches: `.about-card h2`, `.about-foot h2`, `.faq-shell h2`

---

### Tier 4 — Body

General prose. Used in paragraphs, list items, and modal/panel content.

```css
font-family: var(--sans);
font-size: 15px;          /* base */
font-weight: 400;
line-height: 1.6;
color: var(--dim);        /* 58% opacity off-white */
```

Dense UI contexts (flow-step, module copy, news card lede):

```css
font-size: 13px;
line-height: 1.65;
```

---

### Tier 5 — Metadata / mono labels

Navigation elements, addresses, timestamps, data fields, small badges.

```css
font-family: var(--mono);
font-size: 9px – 12px;    /* 9–10px for labels; 12px for data values */
font-weight: 700;
letter-spacing: 0.14em – 0.18em;
text-transform: uppercase;
color: var(--muted);      /* 30% opacity off-white */
```

---

## Color Tokens

```
--white       #f2f2f0          Primary text (dark mode)
--dim         rgba(242,242,240, 0.58)   Body copy
--muted       rgba(242,242,240, 0.30)   Secondary labels, placeholders
--bg          #080808          Page background
--surface     #111111          Card / panel background
--surface-2   #1a1a1a          Elevated surface (inputs)
--surface-3   #222222          Further elevated
--border      rgba(255,255,255, 0.09)   Default rule / divider
--border-2    rgba(255,255,255, 0.18)   Emphasis rule / hover state
```

All tokens invert under `[data-theme="light"]`. Never hardcode hex values
inside page CSS — always use the token.

Status / signal colors:

```
--warn                 #c0392b   Critical / error
--warn-border          rgba(192,57,43, 0.7)
--telemetry-amber      #b87a1e   Warning / advisory
--telemetry-amber-dim  rgba(184,122,30, 0.82)
```

See [signal system memory file] for amber/red semantic rules.

---

## Spacing

No design token for spacing; use rem multiples of the base 15px body size.

Common values in production:

| Usage                        | Value       |
|------------------------------|-------------|
| Section outer padding        | 1.5rem      |
| Card inner padding           | 1.5rem      |
| Module inner padding         | 1.75rem 2rem|
| Gap between grid cells       | 1px (hairline border via `background: var(--border)` on parent) |
| Paragraph margin-bottom      | 1rem        |
| h2 margin-top                | 2.35rem     |

---

## Section Patterns

### Landing page sections (how-it-works, news-preview)

```
max-width: 1040px
margin: 0 auto
padding: 1–2.5rem 1.5rem
```

Section label: `.section-kicker` (Tier 3 above)
Content: 3-column grid with `gap: 1px; background: var(--border)` on
the parent — cells have `background: var(--surface)` and `padding: 1.5rem`.

### Policy / informational pages

```
max-width: 860px
margin: 0 auto
padding: calc(var(--nav-h) + 4.5rem) 1.5rem 5rem
```

Shell class: `.policy-shell`
Page title: Tier 1 h1
Section headings: Tier 2 h2
Eyebrow: `.policy-eyebrow` — mono 10px uppercase muted

---

## News Article Schema

Articles live in `public/js/news-data.js` as entries in the `IX_NEWS` array,
oldest first. The homepage takes `slice(-3).reverse()` for the preview section.
`news.html` reverses the full array (newest first).

```js
{
  id:       'url-safe-slug',   // anchor on news.html
  date:     'Month DD, YYYY',
  dateIso:  'YYYY-MM-DD',      // <time datetime> attribute
  category: 'Platform | Policy | Regulation | Opinion | Analysis',
  title:    'Article headline',
  lede:     'Opening paragraph — shown in preview card on index.html',
  body:     ['para1', 'para2', ...]  // full article; lede is body[0]
}
```

To publish a new article: append an entry to `IX_NEWS` in `news-data.js`.
No other files need to be touched — index.html and news.html both render
dynamically from the array.

---

## Adding New Pages

1. Copy the nav + footer block from `news.html` or `contact.html`.
2. Use `<main class="policy-shell">` for standard informational content.
3. Add the page to the footer nav in `components/footer/footer.html` **and**
   in every `*.html` page footer (footers are duplicated, not component-injected).
4. Add OG + Twitter meta tags matching the pattern in existing pages.
5. Link `css/main.css` only — do not create page-local CSS files.
   Exception: self-contained visual demos (e.g. brand.html) may use a
   `<style>` block scoped to that page.
