# Homepage Refinement Audit Protocol V1

Date: 2026-07-04
Status: Required before homepage refinement implementation.

## Purpose

Audit the current production homepage for inconsistencies in typography tokens,
spacing rhythm, component alignment, and animation timing.

This is a discrepancy audit, not a redesign.

## Non-Negotiables

Do not alter during the audit:

- homepage architecture
- rotating hero concept
- Transfer Portal hierarchy
- Transfer Portal perimeter
- copy
- colors
- content order
- live production files

Do not propose:

- complete redesign
- sitewide CSS sweep
- broad font replacement
- broad radius reset
- new background texture
- invented operational metrics
- additional objects crowding the Transfer Portal

## Audit Output Format

Every finding should include:

| Field | Meaning |
|---|---|
| `area` | Typography, spacing, motion, or component finish |
| `selector` | CSS selector or DOM surface |
| `file` | Source file path |
| `current value` | Existing value or behavior |
| `conflict` | What it conflicts with |
| `impact` | Why it reduces elegant utility |
| `recommendation` | Proposed canonical value or rule |
| `risk` | Low, medium, or high implementation risk |

## Lane 1 — Typography Consistency

Inventory roles:

- hero statement
- rotating hero phrase
- supporting paragraph
- navigation
- section headline
- section eyebrow
- module label
- button label
- data value
- contract address
- status text
- legal and instructional copy

Compare:

- font family
- font weight
- font size
- line height
- letter spacing
- text transform
- maximum line width
- mobile overrides

Goal:

```text
The same semantic role should not be rendered three different ways without a
reason.
```

## Lane 2 — Spacing Rhythm

Audit:

- header to hero
- hero line to supporting copy
- supporting copy to action
- hero to Transfer Portal
- protected portal perimeter
- portal interior padding
- module-to-module spacing
- section heading to body
- section-to-section separation
- final section to footer
- mobile collapsed states

Goal:

```text
Major ideas receive more space than minor relationships.
```

## Lane 3 — Motion Quality

Audit:

- hero text rotation
- crossfade duration
- layout shift during rotating phrases
- portal expand and collapse
- module reveal behavior
- button hover and press states
- navigation hover states
- status transitions
- wallet connection state changes
- mobile-menu opening
- copy-success feedback
- receipt and verification state changes
- loading indicators
- reduced-motion behavior

Target timing bands:

- micro-interactions: 120-180 ms
- controls and panel transitions: 200-300 ms
- hero phrase transitions: 450-700 ms
- operational pulses: deliberate and infrequent

Goal:

```text
Motion should feel composed, not like text or state is being replaced by script.
```

## Lane 4 — Component Finish

Audit:

- button heights
- border widths
- component radii by class
- icon stroke consistency
- vertical centering of text and icons
- hover-state subtlety
- adjacent-control padding
- muted color consistency
- accessible focus states
- active, verified, warning, and disabled state semantics
- mobile-control polish

Goal:

```text
Eliminate small inconsistencies before making dramatic visual changes.
```

## Deliverable

Produce a discrepancy report first. Do not modify CSS or HTML during the audit.

After review, implement only approved normalization changes on an isolated
staging/refinement surface. No production deployment.
