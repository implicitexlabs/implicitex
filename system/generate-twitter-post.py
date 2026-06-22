#!/usr/bin/env python3
"""
ImplicitEx Twitter post image generator.

Format:
    [Logo — mark + wordmark, 1:4 ratio]

    [LINE_SUB  — Orbitron Bold, subordinate]
    [LINE_HERO — Orbitron Bold, dominant ~25% larger]

    [url — Oxanium SemiBold, near-invisible]

Identity: black / white / gray. Fully monochrome.
Amber (#D4A017) is a UI state color — never use it here.

Usage:
    python3 system/generate-twitter-post.py

Edit LINE_SUB, LINE_HERO, and OUTPUT to generate variants.
"""

import cairosvg, io
from PIL import Image, ImageDraw, ImageFont, PngImagePlugin

# ── Output ────────────────────────────────────────────────────────────────────
OUTPUT   = 'app-web/frontend/public/components/images/twitter-post-1.png'

# ── Message ───────────────────────────────────────────────────────────────────
LINE_SUB  = 'SEND USDC.'          # subordinate line — smaller
LINE_HERO = 'VERIFY EVERYTHING.'  # hero line — dominates the composition
URL_TEXT  = 'implicitex.com'

# ── Canvas ────────────────────────────────────────────────────────────────────
W, H = 1200, 675                  # Twitter 16:9 in-feed spec

# ── Assets ────────────────────────────────────────────────────────────────────
WORDMARK_SVG = 'app-web/frontend/public/components/images/wordmark-white.svg'
MARK_SVG     = 'app-web/frontend/public/components/images/brandmark.svg'
ORBITRON     = 'app-web/frontend/public/components/fonts/Orbitron-Bold.ttf'
OXANIUM      = 'app-web/frontend/public/components/fonts/Oxanium-SemiBold.ttf'

# ── Lockup proportions (from brand.html) ─────────────────────────────────────
# lettermark = 25% of wordmark width (1:4)
# stack-gap  = 45% of mark height
WORDMARK_W = 304
WORDMARK_H = round(WORDMARK_W * (14.7 / 201.89))
MARK_W     = round(WORDMARK_W * 0.25)
MARK_H     = MARK_W
STACK_GAP  = round(MARK_H * 0.45)

# ── Spacing ───────────────────────────────────────────────────────────────────
GAP_LOGO_TO_SUB = 52
GAP_SUB_TO_HERO = 10   # tight — two lines read as one thought
GAP_HERO_TO_URL = 62   # URL pushed to floor, owns space below headline

# ── Render ────────────────────────────────────────────────────────────────────
wm_png   = cairosvg.svg2png(url=WORDMARK_SVG, output_width=WORDMARK_W, output_height=WORDMARK_H)
mk_png   = cairosvg.svg2png(url=MARK_SVG,     output_width=MARK_W,     output_height=MARK_H)
wordmark = Image.open(io.BytesIO(wm_png)).convert('RGBA')
mark     = Image.open(io.BytesIO(mk_png)).convert('RGBA')

canvas = Image.new('RGB', (W, H), color=(0, 0, 0))
draw   = ImageDraw.Draw(canvas)
CX     = W // 2

def fit_size(text, max_w, fp, lo=14, hi=300):
    """Binary search for largest font size that fits text within max_w."""
    while lo < hi - 1:
        mid = (lo + hi) // 2
        f = ImageFont.truetype(fp, mid)
        bb = draw.textbbox((0, 0), text, font=f)
        if bb[2] - bb[0] <= max_w:
            lo = mid
        else:
            hi = mid
    return lo

def measure(text, f):
    bb = draw.textbbox((0, 0), text, font=f)
    return bb[2] - bb[0], bb[3] - bb[1]

# Hero line sets the scale — constrained to 62% of canvas width
hero_size = fit_size(LINE_HERO, int(W * 0.62), ORBITRON)
hero_font = ImageFont.truetype(ORBITRON, hero_size)

# Sub line at ~74% of hero size — clearly subordinate
sub_size  = round(hero_size * 0.74)
sub_font  = ImageFont.truetype(ORBITRON, sub_size)

url_font  = ImageFont.truetype(OXANIUM, 15)

wh, hh = measure(LINE_HERO, hero_font)
ws, hs = measure(LINE_SUB,  sub_font)
wu, hu = measure(URL_TEXT,  url_font)

LOCKUP_H = MARK_H + STACK_GAP + WORDMARK_H
TOTAL_H  = LOCKUP_H + GAP_LOGO_TO_SUB + hs + GAP_SUB_TO_HERO + hh + GAP_HERO_TO_URL + hu

# Optical center: 6% above geometric center
TOP = (H - TOTAL_H) // 2 - int(H * 0.06)

# Draw lockup
canvas.paste(mark,     (CX - MARK_W // 2,     TOP),                    mark)
canvas.paste(wordmark, (CX - WORDMARK_W // 2, TOP + MARK_H + STACK_GAP), wordmark)

# Draw headline
sub_y  = TOP + LOCKUP_H + GAP_LOGO_TO_SUB
hero_y = sub_y + hs + GAP_SUB_TO_HERO
url_y  = hero_y + hh + GAP_HERO_TO_URL

draw.text((CX - ws // 2, sub_y),  LINE_SUB,  font=sub_font,  fill=(255, 255, 255))
draw.text((CX - wh // 2, hero_y), LINE_HERO, font=hero_font, fill=(255, 255, 255))
draw.text((CX - wu // 2, url_y),  URL_TEXT,  font=url_font,  fill=(56, 56, 56))

# ── Metadata ──────────────────────────────────────────────────────────────────
xmp = f'''<?xpacket begin="\xef\xbb\xbf" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:xmp="http://ns.adobe.com/xap/1.0/"
        xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">ImplicitEx — {LINE_SUB} {LINE_HERO}</rdf:li></rdf:Alt></dc:title>
      <dc:description><rdf:Alt><rdf:li xml:lang="x-default">ImplicitEx is a direct USDC payment layer on Polygon. Non-custodial. Every transfer independently verifiable on-chain.</rdf:li></rdf:Alt></dc:description>
      <dc:creator><rdf:Seq><rdf:li>ImplicitEx</rdf:li></rdf:Seq></dc:creator>
      <dc:subject>
        <rdf:Bag>
          <rdf:li>USDC</rdf:li><rdf:li>Polygon</rdf:li><rdf:li>stablecoin payments</rdf:li>
          <rdf:li>non-custodial</rdf:li><rdf:li>on-chain verification</rdf:li><rdf:li>ImplicitEx</rdf:li>
        </rdf:Bag>
      </dc:subject>
      <xmp:CreatorTool>ImplicitEx Brand System</xmp:CreatorTool>
      <photoshop:Source>https://implicitex.com</photoshop:Source>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>'''

pnginfo = PngImagePlugin.PngInfo()
pnginfo.add_text('Title',       f'ImplicitEx — {LINE_SUB} {LINE_HERO}')
pnginfo.add_text('Description', 'Direct USDC payments on Polygon. Non-custodial. Every transfer independently verifiable on-chain.')
pnginfo.add_text('Author',      'ImplicitEx')
pnginfo.add_text('URL',         'https://implicitex.com')
pnginfo.add_text('Keywords',    'USDC, Polygon, stablecoin, crypto payments, non-custodial, on-chain, DeFi, ImplicitEx')
pnginfo.add_text('Copyright',   'ImplicitEx 2026')
pnginfo.add_itxt('XML:com.adobe.xmp', xmp, lang='', tkey='')

canvas.save(OUTPUT, 'PNG', pnginfo=pnginfo)
print(f'Saved {OUTPUT}')
print(f'  hero: {hero_size}px  sub: {sub_size}px  total block: {TOTAL_H}px / {H}px canvas')
