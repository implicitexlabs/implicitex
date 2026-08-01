# Coin Card Horizontal Construction Spec V1

**Date:** 2026-07-02
**Status:** Normative geometry, security, and conformance layer.
**Tokens:** `docs/product/coin-card/coin-card.tokens.json`
**Token schema:** `docs/product/coin-card/coin-card.tokens.schema.json`
**Parent constitution:** `docs/product/coincard-constitution.md`

This document freezes Coin Card as a fixed-format credential instrument. It is
not a responsive card component and not a general layout pattern.

Screenshots, smoke records, badge rebuild notes, and Lane A review comments are
non-normative evidence. This document and its token file are the source of truth
for V1 geometry.

## 1. Normative Language

The words MUST, MUST NOT, SHALL, SHALL NOT, SHOULD, and MAY are normative.

An implementation is conformant only when it satisfies this document,
`coin-card/coin-card.tokens.json`, and the parent Constitution. If a screenshot appears to
disagree with the tokens, the screenshot is evidence of a defect, not a new rule.

## 2. Canonical Exterior Boxes

Coin Card V1 has two fixed form factors:

| Form factor | Outer box | Aspect ratio | States |
| --- | ---: | ---: | --- |
| Collapsed acceptance mark | 216 x 44 CSS px | 54:11 | BADGE |
| Expanded horizontal card | 460 x 286 CSS px | 230:143 | INSPECT, TRANSACT, SETTLE |

All dimensions include border because `box-sizing: border-box` is mandatory.

The following are prohibited on the card root:

- `width: auto`
- `height: auto`
- content-driven exterior height
- state-dependent exterior dimensions
- independent horizontal or vertical scaling
- shrinking or expanding to fit recipient names, amounts, status text, loading
  messages, or errors

State transitions replace content inside a fixed plane. They MUST NOT resize the
instrument.

## 3. Fixed Planes

### Collapsed Acceptance Mark

The collapsed form factor is exactly:

```text
outer = 216 x 44
identity area = 172 x 44
lettermark cell = 44 x 44
```

The identity area carries the approved collapsed hierarchy. The lettermark cell
carries only the ImplicitEx lettermark.

Collapsed slots are defined in `coin-card.tokens.json` and include:

| Slot | Required values |
| --- | --- |
| primary claim | x, y, width, height, baseline |
| network/token | x, y, width, height, baseline |
| attribution | x, y, width, height, baseline |
| attribution fit | powered-by width, gap, wordmark height, wordmark width, total width |
| status indicator | x, y, diameter |
| lettermark cell divider | x1, y1, x2, y2 |

Nothing inside the collapsed form may wrap. Overflow behavior is deterministic:
recipient identity uses single-line ellipsis, addresses use controlled middle
truncation, and status text comes from a fixed vocabulary.

### Expanded Horizontal Card

The expanded form factor is exactly:

```text
outer = 460 x 286
identity/header plane = 136
credential plane = 108
action plane = 42
136 + 108 + 42 = 286
```

All expanded states occupy the same exterior box:

```text
box(INSPECT) = box(TRANSACT) = box(SETTLE) = 460 x 286
```

Panels MAY be stacked in one shared grid area or absolutely positioned inside a
fixed state plane. Panels MUST NOT participate in content-driven page height.

Expanded slots are defined in `coin-card.tokens.json` and include:

| Plane | Slot | Required values |
| --- | --- | --- |
| identity/header | primary claim | x, y, width, height, baseline |
| identity/header | recipient name | x, y, width, height, baseline |
| identity/header | network/token | x, y, width, height, baseline |
| identity/header | product identity | x, y, width, height |
| identity/header | product identity fit | max width, max height, object fit, object position |
| identity/header | attribution | x, y, width, height, baseline |
| identity/header | header divider | x1, y1, x2, y2 |
| credential | rows | row id, y, baseline |
| credential | label column | shared x, width |
| credential | value column | shared right edge, maximum width |
| credential | divider | x1, y1, x2, y2 |
| action | status indicator | x, y, diameter |
| action | status text | x, y, width, height, baseline |
| action | CTA | x, y, width, height |
| action | CTA label | x, y, width, height, baseline |

Two conformant implementations MUST place these slots at the same coordinates.
Differences in slot placement are implementation defects, not acceptable visual
interpretation.

## 4. Lettermark Geometry

There is exactly one master lettermark asset for Coin Card V1:

```text
app-web/frontend/public/components/images/lettermark-white.svg
sha256 = 0a307891baa5fbf519e178b962c2a91b00d3d8c009b1f29a04544bb90c83c3c1
viewBox = 0 0 25 25
```

The lettermark is geometry, not decoration. These invariants are mandatory:

- intrinsic aspect ratio MUST be 1:1
- rendered width MUST equal rendered height
- X scale divided by Y scale MUST equal exactly 1.0000
- `preserveAspectRatio` behavior MUST be equivalent to `xMidYMid meet`
- no `scaleX`, `scaleY`, skew, crop, path editing, or container stretching
- no component may set only width or only height and rely on the other dimension
  when exact geometry is required
- the asset path checksum is part of the specification

Approved sizes:

| Placement | Mark box |
| --- | ---: |
| Expanded horizontal card | 40 x 40 CSS px |
| Collapsed acceptance mark | 36 x 36 CSS px |

Collapsed mark placement:

```text
cell = 44 x 44
mark = 36 x 36
clearSpace = (44 - 36) / 2 = 4
```

Expanded mark placement:

```text
mark = 40 x 40
x = 400
y = 20
right clear space = 20
top clear space = 20
```

The lettermark's value shift is contained inside the SVG silhouette. It MUST
NOT change the lettermark's measured box, scale ratio, or slot coordinates.

The internal illumination is tokenized with neutral and bright values. The
animation MAY interpolate between those values, but no external glow, blur,
bloom, bleed, or shadow may extend outside the 40 x 40 expanded mark or the
36 x 36 collapsed mark geometry.

Implementation CSS for the lettermark MUST explicitly set all geometry guards:

```css
width: <token>;
height: <token>;
min-width: <token>;
min-height: <token>;
max-width: <token>;
max-height: <token>;
aspect-ratio: 1 / 1;
object-fit: contain;
flex: 0 0 <token>;
transform: none;
```

Global image rules such as `img { width: 100%; }` MUST NOT affect the mark.

### Canonical Wordmark Assets

All branded marks MUST use canonical repository SVG assets. Typography MUST NOT
be used to imitate the Coin Card or ImplicitEx wordmarks.

Canonical V1 assets:

| Asset | Path | Purpose |
| --- | --- | --- |
| ImplicitEx lettermark | `app-web/frontend/public/components/images/lettermark-white.svg` | upper-right authority mark |
| ImplicitEx wordmark | `app-web/frontend/public/components/images/wordmark-white.svg` | attribution identity after typed "Powered by" |
| Coin Card wordmark | `app-web/frontend/public/components/images/coincard-logo.svg` | collapsed product identity |

The attribution structure is:

```text
typed "Powered by" + canonical ImplicitEx wordmark SVG
```

In the collapsed form, that attribution row MUST satisfy:

```text
poweredByWidth + gap + wordmarkWidth <= attributionSlotWidth
attribution.x + attribution.width <= lettermarkCellDivider.x1
```

The current V1 collapsed attribution slot is:

```text
x = 12
y = 25
width = 148
height = 10
```

This slot is wider than the original supporting-detail slot because the canonical
ImplicitEx wordmark has a 13.73:1 aspect ratio. Clipping the wordmark, shrinking
it below legibility, horizontally compressing it, or replacing it with typed text
is non-conformant.

The collapsed identity structure uses canonical assets:

```text
canonical Coin Card SVG
canonical ImplicitEx wordmark SVG
canonical ImplicitEx lettermark SVG
```

Do not redraw, approximate, typeset, or substitute either wordmark.

The Coin Card wordmark uses `currentColor` in the canonical SVG. When rendered
as an external `<img>`, that color is not reliably inherited from the card. CSS
mask rendering also failed visual inspection for this asset in the construction
preview. A conformant implementation MUST render the Coin Card wordmark as
inline SVG so the SVG paths receive the surrounding CSS color directly:

```text
white on dark / black backgrounds
black on light backgrounds
```

The asset path and checksum remain canonical. The color treatment is
surface-dependent. Do not use CSS masks for the Coin Card wordmark in V1.

Visual inspection on 2026-07-02 confirmed inline SVG rendering for the Coin Card
wordmark in both expanded and collapsed placements. The prior CSS-mask rendering
defect is closed.

The expanded header identity stack is:

```text
USDC accepted here
ImplicitEx Demo Treasury
POLYGON · USDC
canonical Coin Card SVG
typed "Powered by" + canonical ImplicitEx wordmark SVG
```

The expanded product identity slot is:

```text
x = 20
y = 94
width = 140
height = 12
```

The product identity row MUST remain above attribution, below network/token, and
inside the current header plane. It MUST NOT move the header divider, lettermark
slot, credential rows, action plane, or card exterior.

## 5. Visual Slot Ownership

The card has fixed semantic zones from the Constitution. In V1, the two primary
composition zones are:

```text
left = payment information
right = issuer authority
```

The left zone contains the readable payment hierarchy. The right zone contains
the ImplicitEx authority mark. Elements MUST NOT migrate between zones during
state changes or implementation revisions.

The upper-right authority zone carries the lettermark only at compact stamp
scale. The IMPLICITEX wordmark MUST NOT be forced into this zone when it would
violate minimum legibility or distort the lettermark proportion.

Brand constants define the instrument. Variable values define the transaction.
The lettermark, shell, dividers, network/token framework, labels, and action
framework are constants. Recipient, route, destination, amount, fee, total, CTA
state, and execution state are variables.

## 6. Deterministic Overflow

Every variable value needs a fixed behavior before it reaches production.

- recipient name: one line, fixed maximum width, ellipsis
- full recipient name: available in expanded details and accessible label
- address: deterministic middle truncation, first 6 plus final 4
- network and token: controlled enums
- status: controlled enum
- amount, fee, and total: exact USDC representation, never silently rounded or
  abbreviated
- loading content: reserved space only
- errors: controlled code plus controlled short copy
- raw backend or wallet errors: never rendered directly

V1 is English-only unless a locale receives its own fixed copy budget and
conformance fixtures.

## 7. Security Contract

Coin Card must never trust values supplied by the embedding website.

Normative security rules:

- BADGE and INSPECT MUST NOT request wallet access.
- Third-party embeds identify a card by canonical `cardId`; they MUST NOT supply
  a trusted recipient address directly.
- Recipient address, chain, token, issuer, route status, and revocation status
  MUST resolve from the registry-backed manifest.
- The controlled ImplicitEx transaction surface MUST revalidate the card and
  manifest before showing or executing transfer controls.
- Host pages MUST NOT override verified identity fields through HTML attributes,
  CSS variables, URL parameters, query strings, `postMessage`, or storage.
- Host customization MUST be allowlisted presentation tokens only.
- Arbitrary HTML, CSS, JavaScript, URLs, images, campaign content, or backend
  strings MUST NOT be injected into the credential.
- Revoked, expired, unsigned, malformed, or signature-invalid cards MUST enter a
  non-transactable state.
- Transfer execution MUST occur only on an approved ImplicitEx origin.
- Iframe communication, when introduced, MUST use an exact message schema and
  explicit origin validation.
- Untrusted strings are text only. They MUST NOT become HTML.

Current Lane A static registry records are useful prototype evidence, but they
are not the final signed-manifest trust boundary. Until manifest signing exists,
the implementation must label HTTPS registry verification honestly and must not
claim offline cryptographic proof.

## 8. Conformance Requirements

Automated conformance tests SHALL assert:

- collapsed bounding box equals 216 x 44
- every expanded state equals 460 x 286
- exterior width and height do not change after state transitions
- lettermark width equals lettermark height
- lettermark X and Y scale factors are identical
- lettermark asset checksum matches the token file
- long fixture data cannot alter exterior dimensions
- recipient identity cannot override the signed/registry-backed manifest value
- URL parameters cannot override recipient, destination, chain, token, or fee
- BADGE and INSPECT cannot invoke wallet access
- invalid, revoked, or malformed credentials cannot expose execution controls
- rendered destination always matches the verified manifest
- font loading does not create exterior geometry shift

Logical token values have zero tolerance. Rasterized measurements may allow only
the tolerance defined in `coin-card.tokens.json`.

## 9. Generated CSS Tokens

`coin-card/coin-card.tokens.json` is the only hand-authored numeric source for Coin Card
V1 geometry. CSS variables are generated from it:

```text
docs/product/coin-card/coin-card.tokens.json
        -> app-web/frontend/public/coincard/coin-card.tokens.css
```

The generated CSS file MUST NOT be edited by hand. Regenerate it with:

```text
npm run build:coincard-tokens
```

Verify it is current with:

```text
npm run check:coincard-tokens
```

An implementation that manually duplicates canonical values such as `460px`,
`286px`, `40px`, or row coordinates without consuming the generated variables is
not conformant.

The token sheet also has a JSON Schema:

```text
docs/product/coin-card/coin-card.tokens.schema.json
```

The schema is a structural guard. The mathematical tests remain the stronger
source for derived relationships such as row sums, clear space, and ratios.

## 10. Proportion Formulas

The token file records the important expanded-card ratios:

| Ratio | Formula | Value |
| --- | --- | ---: |
| Lettermark width/card width | `40 / 460` | `0.0869565` |
| Lettermark height/card height | `40 / 286` | `0.1398601` |
| Top inset/card width | `20 / 460` | `0.0434783` |
| Top inset/card height | `20 / 286` | `0.0699301` |
| CTA width/card width | `138 / 460` | `0.3000000` |
| CTA height/card height | `22 / 286` | `0.0769231` |
| Header plane/card height | `136 / 286` | `0.4755245` |
| Credential plane/card height | `108 / 286` | `0.3776224` |
| Action plane/card height | `42 / 286` | `0.1468531` |

These ratios are descriptive for V1 and useful when creating new fixed form
factors. They MUST NOT be used to fluidly scale this form factor.

## 11. Change Control

A change is prohibited unless it updates this document, the token file, or both:

- exterior dimensions
- plane heights
- coordinate slots
- lettermark size, path, or checksum
- overflow behavior
- state exterior dimensions
- security trust source
- host override permissions

New phone, square, portrait, or large-feature versions MUST be separate fixed
form factors with their own tokens. They MUST NOT be fluid mutations of this
form factor.

## 12. Frozen Status

The specification may be described as established, but not frozen for production
until both are true:

- browser-level conformance tests pass against rendered BADGE, INSPECT,
  TRANSACT, and SETTLE states
- visual inspection confirms the rendered card matches the measured geometry

The frozen label requires evidence. It is not granted by authoring the document.

## 13. Lane A Classification

Lane A remains valuable evidence, but it is not automatically conformant. Any
current Lane A surface that uses a 460 px collapsed header, content-driven panel
height, non-token mark size, or mixed execution/credential ownership is a
prototype exception until reconciled against this spec.
