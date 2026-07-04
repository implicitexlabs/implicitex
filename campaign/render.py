#!/usr/bin/env python3
"""
render.py — Export SVGs to PNG using local fonts + generate contact sheet.

Pipeline:
  1. Patch each SVG: replace the web @import with @font-face pointing to
     local TTF files in campaign/fonts/ — no network needed at render time.
  2. Export to PNG (1600×900) via CairoSVG.
  3. Composite a 5×2 contact sheet with safe-area overlay and card labels.

Usage:
  python3 render.py
"""

import re
import sys
from pathlib import Path

import cairosvg
from PIL import Image, ImageDraw, ImageFont

# ─── PATHS ───────────────────────────────────────────────────────────────────

ROOT      = Path(__file__).parent
FONTS_DIR = ROOT / 'fonts'
SVG_DIR   = ROOT / 'svg'
PNG_DIR   = ROOT / 'png'
PNG_DIR.mkdir(exist_ok=True)

# ─── LOCAL @font-face DECLARATIONS ───────────────────────────────────────────
# Replaces the Google Fonts web @import in each SVG with absolute-path
# @font-face rules so CairoSVG can find them without any network access.

def font_url(name):
    return (FONTS_DIR / name).as_uri()   # file:///abs/path/...

LOCAL_FONTS_CSS = f"""
@font-face {{
  font-family: 'Orbitron';
  font-style:  normal;
  font-weight: 700;
  src: url('{font_url("Orbitron-Bold.ttf")}') format('truetype');
}}
@font-face {{
  font-family: 'Orbitron';
  font-style:  normal;
  font-weight: 800;
  src: url('{font_url("Orbitron-ExtraBold.ttf")}') format('truetype');
}}
@font-face {{
  font-family: 'Oxanium';
  font-style:  normal;
  font-weight: 500;
  src: url('{font_url("Oxanium-Medium.ttf")}') format('truetype');
}}
@font-face {{
  font-family: 'Oxanium';
  font-style:  normal;
  font-weight: 600;
  src: url('{font_url("Oxanium-SemiBold.ttf")}') format('truetype');
}}
@font-face {{
  font-family: 'Oxanium';
  font-style:  normal;
  font-weight: 700;
  src: url('{font_url("Oxanium-Bold.ttf")}') format('truetype');
}}
"""

CDATA_RE = re.compile(r'<!\[CDATA\[.*?\]\]>', re.DOTALL)

def patch_svg(text: str) -> str:
    """Swap web import for local @font-face declarations."""
    return CDATA_RE.sub(f'<![CDATA[{LOCAL_FONTS_CSS}]]>', text)

# ─── RENDER ──────────────────────────────────────────────────────────────────

W, H = 1600, 900
CARDS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10']

png_paths = []

print('\nRendering SVGs → PNG (local fonts, no network)...\n')
for cid in CARDS:
    svg_path = SVG_DIR / f'{cid}.svg'
    png_path = PNG_DIR / f'{cid}.png'

    svg_text = svg_path.read_text(encoding='utf-8')
    patched  = patch_svg(svg_text)

    cairosvg.svg2png(
        bytestring    = patched.encode('utf-8'),
        write_to      = str(png_path),
        output_width  = W,
        output_height = H,
    )
    size_kb = png_path.stat().st_size / 1024
    print(f'  ✓  {cid}.png  ({size_kb:.0f} KB)')
    png_paths.append(png_path)

# ─── SAFE-AREA ANALYSIS ──────────────────────────────────────────────────────
# Twitter/X safe area: 120px left/right, 100px top/bottom on a 1600×900 canvas.
# Flag any card where non-background pixels exist outside the safe zone.

SAFE_L, SAFE_R = 120, W - 120   # 120, 1480
SAFE_T, SAFE_B = 100, H - 100   # 100, 800
BG_COLOR = (0, 0, 0)            # pure black background
THRESHOLD = 8                   # pixel-brightness delta to count as "content"

print('\nSafe-area audit (120/100px padding)...\n')
violations = {}

for cid, png_path in zip(CARDS, png_paths):
    img    = Image.open(png_path).convert('RGB')
    pixels = img.load()
    flags  = []

    def is_content(r, g, b):
        return r + g + b > THRESHOLD   # anything brighter than near-black

    # Check left strip
    for y in range(H):
        for x in range(SAFE_L):
            px = pixels[x, y]
            if is_content(*px):
                flags.append(f'left ({x}px from edge)')
                break
        else:
            continue
        break

    # Check right strip
    for y in range(H):
        for x in range(SAFE_R, W):
            px = pixels[x, y]
            if is_content(*px):
                flags.append(f'right ({W - x}px from edge)')
                break
        else:
            continue
        break

    # Check top strip
    for x in range(W):
        for y in range(SAFE_T):
            px = pixels[x, y]
            if is_content(*px):
                flags.append(f'top ({y}px from edge)')
                break
        else:
            continue
        break

    # Check bottom strip
    for x in range(W):
        for y in range(SAFE_B, H):
            px = pixels[x, y]
            if is_content(*px):
                flags.append(f'bottom ({H - y}px from edge)')
                break
        else:
            continue
        break

    if flags:
        violations[cid] = flags
        print(f'  ⚠  {cid}: content outside safe area — {", ".join(flags)}')
    else:
        print(f'  ✓  {cid}: clean')

# ─── CONTACT SHEET ───────────────────────────────────────────────────────────

print('\nBuilding contact sheet...\n')

COLS_N, ROWS_N = 5, 2
THUMB_W, THUMB_H = 640, 360
MARGIN  = 20
LABEL_H = 32
BG      = (12, 12, 12)
SAFE_OVERLAY = (255, 60, 60, 60)   # translucent red safe-area overlay

SHEET_W = COLS_N * THUMB_W + (COLS_N + 1) * MARGIN
SHEET_H = ROWS_N * (THUMB_H + LABEL_H) + (ROWS_N + 1) * MARGIN

sheet = Image.new('RGB', (SHEET_W, SHEET_H), BG)
draw  = ImageDraw.Draw(sheet, 'RGBA')

# Try to use a system mono font for labels; fall back to default
try:
    label_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 18)
except Exception:
    label_font = ImageFont.load_default()

# Scaled safe-area boundary within each thumbnail
sx_scale = THUMB_W / W
sy_scale = THUMB_H / H
safe_lx = round(SAFE_L * sx_scale)
safe_rx = round(SAFE_R * sx_scale)
safe_ty = round(SAFE_T * sy_scale)
safe_by = round(SAFE_B * sy_scale)

SAFE_LINE = (255, 80, 80)   # red guide line colour

for i, (cid, png_path) in enumerate(zip(CARDS, png_paths)):
    col = i % COLS_N
    row = i // COLS_N

    base_x = MARGIN + col * (THUMB_W + MARGIN)
    base_y = MARGIN + row * (THUMB_H + LABEL_H + MARGIN)

    # Thumbnail
    img   = Image.open(png_path).convert('RGB')
    thumb = img.resize((THUMB_W, THUMB_H), Image.LANCZOS)
    sheet.paste(thumb, (base_x, base_y))

    # Safe-area guide lines (thin red hairlines)
    draw.line([(base_x + safe_lx, base_y), (base_x + safe_lx, base_y + THUMB_H)], fill=SAFE_LINE, width=1)
    draw.line([(base_x + safe_rx, base_y), (base_x + safe_rx, base_y + THUMB_H)], fill=SAFE_LINE, width=1)
    draw.line([(base_x, base_y + safe_ty), (base_x + THUMB_W, base_y + safe_ty)], fill=SAFE_LINE, width=1)
    draw.line([(base_x, base_y + safe_by), (base_x + THUMB_W, base_y + safe_by)], fill=SAFE_LINE, width=1)

    # Violation badge
    if cid in violations:
        draw.rectangle([base_x, base_y, base_x + 16, base_y + 16], fill=(220, 50, 50))

    # Label bar
    label_y = base_y + THUMB_H
    draw.rectangle([base_x, label_y, base_x + THUMB_W, label_y + LABEL_H], fill=(24, 24, 24))
    draw.text((base_x + 8, label_y + 6), cid.upper(), font=label_font, fill=(180, 180, 180))

sheet_path = ROOT / 'contact-sheet.png'
sheet.save(str(sheet_path), 'PNG', optimize=True)

print(f'  Contact sheet → {sheet_path}')
print(f'  Dimensions: {SHEET_W}×{SHEET_H}px')
print(f'  Red hairlines = Twitter/X safe-area boundary (120/100px)\n')

# ─── SUMMARY ─────────────────────────────────────────────────────────────────

print('=' * 60)
if violations:
    print(f'  {len(violations)} card(s) with safe-area content:')
    for cid, flags in violations.items():
        print(f'    {cid}: {", ".join(flags)}')
else:
    print('  All 10 cards clear the safe-area boundary.')
print('=' * 60)
print()
