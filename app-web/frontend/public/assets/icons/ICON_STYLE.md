# ImplicitEx Icon Style

ImplicitEx UI icons use a pixel-block SVG system, not line art.

The goal is a compact symbolic language: crisp, tactical, readable at 16x16, and visually consistent with the ImplicitEx interface.

## Base Rules

- Use `width="16"`, `height="16"`, and `viewBox="0 0 16 16"` unless an exception is intentional and documented in this file.
- Use `shape-rendering="crispEdges"`.
- Build icons from whole-pixel rectangles only.
- Use filled paths or rects.
- Prefer one filled `<path>` when practical.
- Do not use strokes.
- Do not use curves, rounded corners, filters, opacity, transforms, gradients, or anti-aliased paths.
- Preserve a transparent background for normal icons.
- Preserve intentional negative space; icons must remain readable at 16x16.
- Do not trace, copy, or closely reproduce stock art or third-party icon designs.

## File Simplicity

SVG files should be simple enough to thumbnail correctly in common file browsers.

- Do not use XML prologs.
- Do not use external references.
- Do not embed raster images.
- Do not include unnecessary metadata.
- Do not include editor-specific comments or exported application data.
- Keep the SVG source clean, portable, and easy to review in Git diffs.

## Fill And Color

- Prefer `fill="currentColor"` for normal production icons so the UI can control icon color through CSS.
- Use `fill="#000"` only when creating a fixed black source/proof icon or when matching an existing source file that intentionally uses black.
- Do not bake UI state colors into the SVG. States such as active, disabled, warning, success, or inverse should be handled by CSS unless the icon is specifically documented as an inverse asset.
- Inside masks, use `#fff` for the visible field and `#000` for the punched-out silhouette.
- Outside masks, visible fills should use `currentColor`.

## Grid And Footprint

- Keep most icons inside an optical footprint around `x=2..14` and `y=1..14`.
- Avoid touching the outer canvas edges unless the icon needs the extra pixel for readability.
- Use consistent visual weight across the icon family.
- Avoid large filled blocks when negative space can clarify the symbol.
- Avoid overly thin details that disappear at 1x scale.
- Prefer clear symbolic silhouettes over miniature illustrations.

## Documented Exceptions

Exceptions to the 16x16 canvas must be listed here with the reason.

Current exceptions:

- `usdc.svg` / `usdc-inverse.svg`: retained 11x11 benchmark mark because the pixel balance, negative space, and symbol recognition read well at small sizes.
- `dollar.svg` / `dollar-inverse.svg`: derived from the USDC internal dollar mark and retained for consistency with the USDC symbol system.

Do not resize, redraw, or normalize documented exceptions unless the change is deliberate and recorded here.

## Normal Icons

Normal icons should be transparent-background silhouettes.

A normal icon should usually contain:

```svg
<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
  <path fill="currentColor" d="..." />
</svg>
```

Normal icons should not include masks, background rectangles, or inverse fills.

## Inverse Icons

Inverse icons are only for cases where the icon is intentionally punched out of a solid shape.

- Inverse icons should be strict masks of the exact normal silhouette.
- The inverse silhouette must match the normal icon geometry.
- When editing an icon pair, edit the normal icon first, then update the inverse icon from the exact same geometry.
- Never manually invent a different inverse silhouette.
- Do not redesign the inverse version independently.
- Use unique mask IDs to avoid collisions when multiple SVGs appear on the same page.
- Only create an inverse icon when the UI specifically needs the punched-out effect.
- Do not use inverse icons as the default version of an icon.

## Semantic Clarity

Each icon should communicate one idea.

Before finalizing an icon, check that it reads correctly at 16x16 without labels.

Examples:

- Wallet: square wallet body, open interior, right-side latch/strap, small snap.
- Copy: two overlapping documents, front document dominant.
- External link: open window/document plus arrow exiting upper-right.
- Gas: pump body, display/window, simplified hose/nozzle.
- Chain link: two interlocking links, not one long capsule.
- Block: blockchain block, cube, or stacked block; not a document unless the meaning is specifically "file."

Before adding a new icon, compare it against existing icons with nearby meanings. If it could be confused at 16x16, simplify the silhouette or choose a different metaphor.

## USDC Benchmark

The USDC mark is the benchmark symbol.

Its 11x11 design is intentionally retained because the pixel balance, negative space, and symbol recognition read well at small sizes.

The internal 11x11 mark should not be casually redrawn.

## Review Checklist

An icon is ready only if:

- It uses the correct documented canvas size.
- It uses whole-pixel geometry.
- It has no strokes, curves, transforms, opacity, filters, gradients, rounded corners, or unnecessary metadata.
- It remains readable at 16px.
- It still looks balanced at 24px and 32px.
- It matches the visual weight of the existing ImplicitEx icon family.
- It uses negative space intentionally.
- It does not resemble copied stock art.
- It has a clear semantic role.
- It does not visually conflict with another icon in the set.
- Normal and inverse versions, if both exist, share the exact same silhouette.
