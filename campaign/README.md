# ImplicitEx Campaign Build System

10-card Twitter/X campaign at 1600×900px. Node.js SVG generation → Python PNG export.

## Quick start

```bash
# 1. Generate SVG masters
node generate-campaign.js

# 2. Export PNGs + contact sheet
python3 render.py
```

Output: `svg/a1–a10.svg`, `png/a1–a10.png`, `contact-sheet.png`

---

## Font rendering dependency

The TTFs in `campaign/fonts/` are for repository portability. CairoSVG renders text
through Pango/Cairo, which only sees fonts registered with the system's Fontconfig —
`@font-face src: url(...)` inside an SVG is silently ignored.

Before running `render.py` on a new machine, install the fonts:

```bash
mkdir -p ~/.local/share/fonts
cp campaign/fonts/*.ttf ~/.local/share/fonts/
fc-cache -fv ~/.local/share/fonts
```

Verify registration:

```bash
fc-list | grep -i orbitron
fc-list | grep -i oxanium
```

Expected output:
```
/home/<user>/.local/share/fonts/Orbitron-Bold.ttf: Orbitron:style=Bold
/home/<user>/.local/share/fonts/Orbitron-ExtraBold.ttf: Orbitron,Orbitron ExtraBold:style=ExtraBold,Regular
/home/<user>/.local/share/fonts/Oxanium-Medium.ttf: Oxanium,Oxanium Medium:style=Medium,Regular
/home/<user>/.local/share/fonts/Oxanium-SemiBold.ttf: Oxanium,Oxanium SemiBold:style=SemiBold,Regular
/home/<user>/.local/share/fonts/Oxanium-Bold.ttf: Oxanium:style=Bold
```

If `fc-list` returns nothing for these fonts, the PNGs will render with the system
fallback sans-serif — structurally correct but missing the Orbitron/Oxanium character
that the campaign thesis depends on.

---

## Python dependencies

```bash
pip install cairosvg pillow
```

---

## Safe-area audit

`render.py` runs a pixel-level audit automatically. Content must stay within 120px L/R
and 100px T/B on the 1600×900 canvas (Twitter/X safe zone). Background textures (grid,
topo, world map) are designed to bleed to canvas edges and will be flagged — these are
expected false positives. Violations on text, lettermark, or wordmark elements are not.

Cards that use full-bleed background textures: A3, A5, A6, A8, A10.
Cards with clean pixel audits: A1, A2, A4, A7, A9.

---

## Visual philosophy

See `docs/marketing/campaign-thesis.md`.
