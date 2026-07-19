# ImplicitEx Block Type System

**Status:** Specification v1.4 — 2026-06-24 — **GEOMETRY FROZEN**  
**Scope:** All pixel-block wordmarks, glyphs, and branded typographic elements  
**Authority:** This document governs any Claude or Codex output that generates block-type SVGs

> **Design freeze — effective 2026-06-24**  
> No geometry changes. No spacing changes. No new effects. The next revision to §7 requires evidence from real usage — Coin Cards, registry UI, footer, loading states, favicon — not speculative improvement. If a real usability issue surfaces in context, revise. Otherwise, do not touch.

---

## 1. What This Is

The ImplicitEx Block Type System is a modular, grid-based glyph construction method in which every letter is assembled from discrete square blocks. It is used for branded wordmarks (WEB3, IX, COIN, CARD, TX, etc.) and any typographic element that requires the visual language of distributed, independent, verifiable units.

This is not a general-purpose typeface. It is a proprietary construction system whose visual grammar mirrors the product's technical philosophy: individual blocks cooperating, nothing fused that does not need to be.

The system has two rendering variants — **Primary** and **Compact** — with identical construction geometry and different inter-block spacing.

The documentation is organized in three levels:

- **Level 1 — Block Type System** (this document, §§1–6, 8–13): the general construction language — grid, block rules, spacing, rendering constraints, and the reusable glyph alphabet.
- **Level 2 — Canonical Assets** (§7 and future parallel sections): fixed designs with locked parameters. `WEB3` is the first. Future entries: `IX`, `TX`, `COIN`, `CARD`, etc. Canonical assets are referenced, not regenerated.
- **Level 3 — Generated Glyphs**: new words assembled from Level 1 rules for one-off use. Not brand assets. May be built on demand using the construction rules in §11.

---

## 2. Core Vocabulary

| Term | Definition |
|------|-----------|
| **Block** | The smallest square unit. Every glyph is made exclusively of blocks. |
| **Gap** | The empty space between adjacent blocks (horizontal and vertical). |
| **Cell** | The 5 × 7 grid slot occupied by one uppercase glyph. |
| **Glyph** | One letter or symbol constructed from blocks on a Cell. |
| **Canonical Mark** | Rendering variant: blocks touching, Gap = 0. Default everywhere. |
| **Construction Mark** | Rendering variant: blocks separated by Gap ≥ B/8. Used to reveal underlying block structure. |
| **B** | Block unit length (one side of one square block). |
| **G** | Gap width. G = B/8 in Primary. G = 0 in Compact. |

---

## 3. Grid Specification

Every glyph occupies a 5-column × 7-row cell of square blocks.

```
col:  0   1   2   3   4
     ■   ■   ■   ■   ■   row 0
     ■   ■   ■   ■   ■   row 1
     ■   ■   ■   ■   ■   row 2
     ■   ■   ■   ■   ■   row 3
     ■   ■   ■   ■   ■   row 4
     ■   ■   ■   ■   ■   row 5
     ■   ■   ■   ■   ■   row 6
```

- 5 columns, 7 rows = 35 addressable block positions per glyph
- Each position is either **filled** (block rendered) or **empty** (void)
- The system is monospace: every glyph occupies identical overall dimensions

### 3.1 SVG Coordinate System

Use these canonical unit values:

```
B = 8    (block side length, in SVG coordinate units)
G = 1    (gap width in Primary mode — exactly B/8)
S = B+G  (stride — the distance from block origin to next block origin)
  = 9    (Primary)
  = 8    (Compact)
```

**Block origin for position (col, row):**

| Mode | x | y |
|------|---|---|
| Primary | `col × 9` | `row × 9` |
| Compact | `col × 8` | `row × 8` |

**Block rectangle:**
```
x1 = col × S
y1 = row × S
x2 = x1 + 8
y2 = y1 + 8
```

**SVG path for one block:**
```
M x1,y1 H x2 V y2 H x1 Z
```

### 3.2 Glyph Bounding Box

| Mode | Width | Height |
|------|-------|--------|
| Primary | `5×9 − 1 = 44` | `7×9 − 1 = 62` |
| Compact | `5×8 = 40` | `7×8 = 56` |

*(Primary subtracts 1 because the last column/row has no trailing gap.)*

### 3.3 Inter-Glyph Spacing

When composing multiple glyphs into a wordmark:

| Mode | Inter-glyph space |
|------|------------------|
| Primary | `3G = 3` coordinate units |
| Compact | `2` coordinate units (fixed) |

**Total wordmark width for N glyphs:**

```
Primary:  N × 44 + (N−1) × 3
Compact:  N × 40 + (N−1) × 2
```

---

## 4. Rendering Rules (Absolute, No Exceptions)

These constraints apply to every use of the block type system, across every medium, at every size.

1. **Every block is a perfect square.** No rectangles, no trapezoids, no stretched units.
2. **No anti-aliasing.** All edges are hard. Use `shape-rendering="crispEdges"` in SVG.
3. **No rounded corners.** `rx`, `ry`, `border-radius` are never applied to blocks.
4. **No beveling, embossing, or 3D.** The blocks are flat planes.
5. **No gradients.** Fills are solid, single-color values only.
6. **No shadows.** No `drop-shadow`, `box-shadow`, or `filter`.
7. **No glow.** No bloom, outer glow, or light effect of any kind.
8. **No perspective.** No skew, rotation, or projection transforms.
9. **No decorative fills.** Fills are `currentColor`, a named CSS variable, or a hex constant — never a pattern or texture.
10. **Adjacent blocks are never merged.** In Primary mode, every filled position renders as its own discrete block element. Do not collapse adjacent filled positions into a single rectangle. *(Exception: Compact mode merges adjacent filled positions into rectangles for render efficiency, as gaps are zero.)*

---

## 5. Canonical Mark

**Default everywhere.** Use at all sizes unless the Construction Mark is specifically required.

**Visual meaning:** One unified protocol. Blocks touch to form coherent, immediately legible letterforms. Recognizable at a glance without cognitive delay.

**When to use:** All brand applications — pages, presentations, documentation, marketing, UI, favicon, mobile stamps. If you are unsure which variant to use, use this one.

**SVG template:**
```xml
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 40 56"
     shape-rendering="crispEdges"
     aria-hidden="true">
  <!-- Adjacent filled positions MAY be merged into rectangles for efficiency -->
  <!-- M x1,y1 H x2 V y2 H x1 Z -->
</svg>
```

---

## 6. Construction Mark

**Secondary use only.** Not a logo. Used to reveal the underlying block structure of the system.

**Visual meaning:** Many independent blocks cooperating. The gaps carry semantic weight — each block is a discrete, verifiable unit. The letter is *assembled*, not drawn.

**When to use:** Block Type System documentation, design explainers, behind-the-scenes graphics, animation where blocks assemble into the Canonical Mark. Not for standard brand use.

**SVG template:**
```xml
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 44 62"
     shape-rendering="crispEdges"
     aria-hidden="true">
  <!-- Each filled position = one path element — never merged -->
  <!-- M x1,y1 H x2 V y2 H x1 Z  where x2=x1+8, y2=y1+8 -->
</svg>
```

---

## 7. WEB3 Fixed Mark — Locked Construction Parameters

**The WEB3 mark is a canonical brand asset with fixed construction parameters.**

The Block Type System defines the general construction language. Individual brand assets may define fixed construction values where visual identity requires them. The WEB3 mark is the first canonical implementation of the system.

The general alphabet (§3) defines Primary gap as B/8 and uses a 5×7 cell. The WEB3 mark uses a 5×5 cell and a Primary gap of 2 units — these values were evaluated at logo display size and confirmed as the correct visual weight for this mark. They are not derived from the general rules; they are fixed by this section.

### 7.1 Canonical Grid

```text
Grid:   24 columns × 5 rows
Layout: W(5) + gap(1) + E(5) + gap(1) + B(6) + gap(1) + 3(5) = 24
Filled: 69 blocks
```

Character widths:
- `W` — 5 cols × 5 rows
- `E` — 5 cols × 5 rows
- `B` — 6 cols × 5 rows (open right counter — not an 8)
- `3` — 5 cols × 5 rows

Canonical glyph map (X = filled, . = empty, `|` = inter-character gap, not rendered):

```text
X.X.X | XXXXX | XXXXX. | XXXXX
X.X.X | X.... | X....X | ....X
X.X.X | XXXXX | XXXXX. | .XXXX
X.X.X | X.... | X....X | ....X
XXXXX | XXXXX | XXXXX. | XXXXX
```

### 7.2 WEB3 Canonical Mark — Locked

**Default. Use everywhere.**

| Parameter | Value |
|-----------|-------|
| Block unit (B) | 8 coordinate units |
| Internal block gap (G) | **0** |
| Stride (S = B + G) | 8 |
| Letter gap | 1 empty block column = 8 coordinate units |
| ViewBox | `0 0 192 40` |
| Merged rect paths | 30 |
| Asset file | `components/images/web3-canonical.svg` |

Block origin: `x = col × 8`, `y = row × 8`  
Adjacent filled blocks in the same row are merged into single rectangles. All rectangles are exactly 8 units tall and a multiple of 8 units wide.

### 7.3 WEB3 Construction Mark — Locked

**Secondary. Used to illustrate the block system, not as a brand mark.**

| Parameter | Value |
|-----------|-------|
| Block unit (B) | 8 coordinate units |
| Internal block gap (G) | **2 coordinate units** (= B/4) |
| Stride (S = B + G) | 10 |
| Letter gap | 1 empty block column = 10 coordinate units |
| ViewBox | `0 0 238 48` |
| Discrete block paths | 69 |
| Asset file | `components/images/web3-construction.svg` |

Block origin: `x = col × 10`, `y = row × 10`  
Block rect: `M x,y H x+8 V y+8 H x Z`  
Every filled position is a separate path element — adjacent blocks are never merged.

### 7.4 Why Gap = 2, Not B/8

The general alphabet spec specifies B/8 as the minimum gap for Primary. At B=8 that is 1 coordinate unit — visually effective for large display sizes but marginal at mid-range logo sizes. The WEB3 logo is a fixed mark used at known sizes; gap=2 (B/4) was evaluated at logo display size and confirmed as the correct visual weight for this specific mark. This is not a deviation — it is the locked construction for WEB3.

### 7.5 Canonical Glyph Geometry

The WEB3 logo is a fixed brand asset.

The glyph maps shown in §7.1 are normative.

They shall not be:

- redesigned
- optically corrected
- kerned
- simplified
- interpreted
- regenerated from the general alphabet

Future revisions may add additional block glyphs to the alphabet, but the canonical WEB3 glyphs remain fixed unless explicitly superseded by a new version of this specification.

### 7.6 Canonical Source Assets

The following SVG files are the normative implementation of the WEB3 mark:

```text
components/images/web3-canonical.svg     ← default, use everywhere
components/images/web3-construction.svg  ← secondary, system documentation only
```

If any discrepancy exists between this written specification and the SVG files, **the SVG files are authoritative**.

Changes to either asset require a corresponding update to this specification and a version increment on the Status line.

---

## 8. Color Rules

| Use | Value |
|-----|-------|
| Default foreground | `currentColor` (inherits from CSS) |
| On dark background | `#f2f2f0` (ImplicitEx off-white) |
| On light background | `#111111` (ImplicitEx near-black) |
| Accent state | `#D4A017` only when indicating live/verified/operational state |
| Never | Gradients, opacity fades, RGB color shifts within a single glyph |

The block type system observes the same accent discipline as the rest of the design system: `#D4A017` is a state signal, not a decorative color.

---

## 9. Glyph Catalog

### 8.1 Notation

Grid maps use:
- `■` = filled block
- `.` = empty (void)
- Columns 0–4 (left to right), Rows 0–6 (top to bottom)

### 8.2 Established Glyphs

#### I
```
col: 0 1 2 3 4
row 0: ■ ■ ■ ■ ■
row 1: . . ■ . .
row 2: . . ■ . .
row 3: . . ■ . .
row 4: . . ■ . .
row 5: . . ■ . .
row 6: ■ ■ ■ ■ ■
```

#### X
```
col: 0 1 2 3 4
row 0: ■ . . . ■
row 1: ■ . . . ■
row 2: . ■ . ■ .
row 3: . . ■ . .
row 4: . ■ . ■ .
row 5: ■ . . . ■
row 6: ■ . . . ■
```

#### W
```
col: 0 1 2 3 4
row 0: ■ . . . ■
row 1: ■ . . . ■
row 2: ■ . . . ■
row 3: ■ . ■ . ■
row 4: ■ . ■ . ■
row 5: ■ ■ . ■ ■
row 6: ■ . . . ■
```

#### E
```
col: 0 1 2 3 4
row 0: ■ ■ ■ ■ ■
row 1: ■ . . . .
row 2: ■ . . . .
row 3: ■ ■ ■ ■ .
row 4: ■ . . . .
row 5: ■ . . . .
row 6: ■ ■ ■ ■ ■
```

#### B
```
col: 0 1 2 3 4
row 0: ■ ■ ■ ■ .
row 1: ■ . . . ■
row 2: ■ . . . ■
row 3: ■ ■ ■ ■ .
row 4: ■ . . . ■
row 5: ■ . . . ■
row 6: ■ ■ ■ ■ .
```

#### 3
```
col: 0 1 2 3 4
row 0: ■ ■ ■ ■ .
row 1: . . . . ■
row 2: . . . . ■
row 3: . ■ ■ ■ .
row 4: . . . . ■
row 5: . . . . ■
row 6: ■ ■ ■ ■ .
```

#### T
```
col: 0 1 2 3 4
row 0: ■ ■ ■ ■ ■
row 1: . . ■ . .
row 2: . . ■ . .
row 3: . . ■ . .
row 4: . . ■ . .
row 5: . . ■ . .
row 6: . . ■ . .
```

#### X (see above — TX is T + X)

#### C
```
col: 0 1 2 3 4
row 0: . ■ ■ ■ ■
row 1: ■ . . . .
row 2: ■ . . . .
row 3: ■ . . . .
row 4: ■ . . . .
row 5: ■ . . . .
row 6: . ■ ■ ■ ■
```

#### O
```
col: 0 1 2 3 4
row 0: . ■ ■ ■ .
row 1: ■ . . . ■
row 2: ■ . . . ■
row 3: ■ . . . ■
row 4: ■ . . . ■
row 5: ■ . . . ■
row 6: . ■ ■ ■ .
```

#### N
```
col: 0 1 2 3 4
row 0: ■ . . . ■
row 1: ■ ■ . . ■
row 2: ■ . ■ . ■
row 3: ■ . ■ . ■
row 4: ■ . . ■ ■
row 5: ■ . . . ■
row 6: ■ . . . ■
```

#### V
```
col: 0 1 2 3 4
row 0: ■ . . . ■
row 1: ■ . . . ■
row 2: ■ . . . ■
row 3: . ■ . ■ .
row 4: . ■ . ■ .
row 5: . . ■ . .
row 6: . . ■ . .
```

#### R
```
col: 0 1 2 3 4
row 0: ■ ■ ■ ■ .
row 1: ■ . . . ■
row 2: ■ . . . ■
row 3: ■ ■ ■ ■ .
row 4: ■ . ■ . .
row 5: ■ . . ■ .
row 6: ■ . . . ■
```

#### Y
```
col: 0 1 2 3 4
row 0: ■ . . . ■
row 1: ■ . . . ■
row 2: . ■ . ■ .
row 3: . . ■ . .
row 4: . . ■ . .
row 5: . . ■ . .
row 6: . . ■ . .
```

#### G
```
col: 0 1 2 3 4
row 0: . ■ ■ ■ ■
row 1: ■ . . . .
row 2: ■ . . . .
row 3: ■ . . ■ ■
row 4: ■ . . . ■
row 5: ■ . . . ■
row 6: . ■ ■ ■ ■
```

#### H
```
col: 0 1 2 3 4
row 0: ■ . . . ■
row 1: ■ . . . ■
row 2: ■ . . . ■
row 3: ■ ■ ■ ■ ■
row 4: ■ . . . ■
row 5: ■ . . . ■
row 6: ■ . . . ■
```

#### A
```
col: 0 1 2 3 4
row 0: . . ■ . .
row 1: . ■ . ■ .
row 2: ■ . . . ■
row 3: ■ ■ ■ ■ ■
row 4: ■ . . . ■
row 5: ■ . . . ■
row 6: ■ . . . ■
```

#### D
```
col: 0 1 2 3 4
row 0: ■ ■ ■ ■ .
row 1: ■ . . . ■
row 2: ■ . . . ■
row 3: ■ . . . ■
row 4: ■ . . . ■
row 5: ■ . . . ■
row 6: ■ ■ ■ ■ .
```

#### K
```
col: 0 1 2 3 4
row 0: ■ . . . ■
row 1: ■ . . ■ .
row 2: ■ . ■ . .
row 3: ■ ■ . . .
row 4: ■ . ■ . .
row 5: ■ . . ■ .
row 6: ■ . . . ■
```

#### L
```
col: 0 1 2 3 4
row 0: ■ . . . .
row 1: ■ . . . .
row 2: ■ . . . .
row 3: ■ . . . .
row 4: ■ . . . .
row 5: ■ . . . .
row 6: ■ ■ ■ ■ ■
```

#### M
```
col: 0 1 2 3 4
row 0: ■ . . . ■
row 1: ■ ■ . ■ ■
row 2: ■ . ■ . ■
row 3: ■ . ■ . ■
row 4: ■ . . . ■
row 5: ■ . . . ■
row 6: ■ . . . ■
```

#### P
```
col: 0 1 2 3 4
row 0: ■ ■ ■ ■ .
row 1: ■ . . . ■
row 2: ■ . . . ■
row 3: ■ ■ ■ ■ .
row 4: ■ . . . .
row 5: ■ . . . .
row 6: ■ . . . .
```

#### S
```
col: 0 1 2 3 4
row 0: . ■ ■ ■ ■
row 1: ■ . . . .
row 2: ■ . . . .
row 3: . ■ ■ ■ .
row 4: . . . . ■
row 5: . . . . ■
row 6: ■ ■ ■ ■ .
```

#### U
```
col: 0 1 2 3 4
row 0: ■ . . . ■
row 1: ■ . . . ■
row 2: ■ . . . ■
row 3: ■ . . . ■
row 4: ■ . . . ■
row 5: ■ . . . ■
row 6: . ■ ■ ■ .
```

---

## 10. Composing Wordmarks

### IX (Primary)

ViewBox: `0 0 91 62`  
*(44 + 3 + 44 = 91)*

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 91 62"
     shape-rendering="crispEdges" aria-hidden="true">
  <!-- I glyph: offset x=0 -->
  <!-- row 0: all 5 blocks -->
  <path fill="currentColor" d="
    M 0,0 H 8 V 8 H 0 Z
    M 9,0 H 17 V 8 H 9 Z
    M 18,0 H 26 V 8 H 18 Z
    M 27,0 H 35 V 8 H 27 Z
    M 36,0 H 44 V 8 H 36 Z
    M 18,9 H 26 V 17 H 18 Z
    M 18,18 H 26 V 26 H 18 Z
    M 18,27 H 26 V 35 H 18 Z
    M 18,36 H 26 V 44 H 18 Z
    M 18,45 H 26 V 53 H 18 Z
    M 0,54 H 8 V 62 H 0 Z
    M 9,54 H 17 V 62 H 9 Z
    M 18,54 H 26 V 62 H 18 Z
    M 27,54 H 35 V 62 H 27 Z
    M 36,54 H 44 V 62 H 36 Z
  "/>
  <!-- X glyph: offset x=47 (44 + 3) -->
  <path fill="currentColor" d="
    M 47,0 H 55 V 8 H 47 Z
    M 83,0 H 91 V 8 H 83 Z
    M 47,9 H 55 V 17 H 47 Z
    M 83,9 H 91 V 17 H 83 Z
    M 56,18 H 64 V 26 H 56 Z
    M 74,18 H 82 V 26 H 74 Z
    M 65,27 H 73 V 35 H 65 Z
    M 56,36 H 64 V 44 H 56 Z
    M 74,36 H 82 V 44 H 74 Z
    M 47,45 H 55 V 53 H 47 Z
    M 83,45 H 91 V 53 H 83 Z
    M 47,54 H 55 V 62 H 47 Z
    M 83,54 H 91 V 62 H 83 Z
  "/>
</svg>
```

### WEB3 (Construction Mark — 5×7 general alphabet layout)

ViewBox: `0 0 185 62`  
*(4 × 44 + 3 × 3 = 176 + 9 = 185)*

Glyph offsets: W=0, E=47, B=94, 3=141

Note: This is a general-alphabet rendering of WEB3 using 5×7 cells. The **canonical WEB3 brand asset** is the fixed 5×5 mark defined in §7, not this general-alphabet composition.

---

## 11. Construction Rules for New Glyphs

When adding a new glyph to this system:

1. **Map the 5×7 grid first.** Sketch on paper or in a plain text grid map (as shown in §8.2) before writing SVG coordinates.
2. **Each filled position is one block.** In Construction Mark mode, it produces one path element. In Canonical Mark mode, adjacent filled positions may be merged into a single rectangle path.
3. **Verify horizontal symmetry where the letter demands it.** I, O, U, V, W, A, X are bilaterally symmetric. Check that the grid map reflects this before generating paths.
4. **Distinguish B from D, E from F, P from R** by checking counters (the interior spaces). The 5-wide grid is tight; counters must read clearly at 32 px.
5. **Do not invent new grid dimensions.** Every glyph uses 5 × 7. Do not create 4-wide, 6-wide, or variable-width cells — the monospace constraint is a feature, not a limitation.
6. **Do not use diagonal approximations.** W, X, V, N, and similar letters use stepped diagonals (single-block-wide stair steps). This is correct behavior. Do not attempt to draw true diagonal lines.
7. **Validate the output.** Render the SVG at 32 px (Construction Mark) and 16 px (Canonical Mark). If blocks merge visually at 32 px or are invisible at 16 px, a construction error exists.

---

## 12. Usage Summary

| Context | Variant | Notes |
|---------|---------|-------|
| Wordmarks on page | **Canonical** | Default |
| Branded section headers | **Canonical** | Default |
| Favicon | **Canonical** | Default |
| Mobile nav stamp | **Canonical** | Default |
| Coin card corner | **Canonical** | Default |
| Print / presentation | **Canonical** | Default |
| Loading state badge | **Canonical** | Default |
| Social media avatar | **Canonical** | Default |
| Block Type System docs | Construction | Explaining the system |
| Design explainers | Construction | Behind-the-scenes context |
| Assembly animation | Construction → Canonical | Blocks assemble into mark |

---

## 13. What This System Is Not

- **Not a general-purpose display font.** It does not replace Orbitron (headlines), Oxanium (UI), Inter (body), or IBM Plex Mono (technical data). Those font roles are unchanged.
- **Not a replacement for the lettermark.** The vector `IX` lettermark (curved paths, from `lettermark-white.svg`) remains the primary brand mark for the logo lockup. The block type system is for wordmarks and branded elements where the pixel-block aesthetic is intentional.
- **Not decorative.** Every design decision in this system — the gaps, the square blocks, the no-rounding rule — reflects the product's technical philosophy. Treat it accordingly.
