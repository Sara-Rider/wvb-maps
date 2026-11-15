# Renders share/wvb-share-<region>.png (1200x630): night ridge, stacked wordmark, region on a WV map.
# Needs Playwright (Chromium), the Cinzel and Raleway fonts, the stacked wordmark SVG and the winged badge PNG
# from the WVB Logo Kit (paths below are from the build machine; adjust before re-running).
# Usage: python scripts/build_share_images.py "Region Name" ...
import sys, re, html, json, math, base64
from playwright.sync_api import sync_playwright
R=json.load(open('/home/claude/wvb-maps/regions.geojson'))['features']
wm=open('/home/claude/share/wm.svg').read()
badge='data:image/png;base64,'+base64.b64encode(open('/home/claude/kit/wvb-badge-winged-v2.png','rb').read()).decode()
def rings(g):
    return g['coordinates'] if g['type']=='Polygon' else [r for p in g['coordinates'] for r in p]
pts=[c for f in R for r in rings(f['geometry']) for c in r]
k=math.cos(math.radians(38.9))
xs=[p[0]*k for p in pts]; ys=[p[1] for p in pts]
minx,maxx,miny,maxy=min(xs),max(xs),min(ys),max(ys)
def mapsvg(region,W):
    s=W/(maxx-minx); H=(maxy-miny)*s
    out=[]
    for f in R:
        d=''.join('M'+'L'.join(f'{(p[0]*k-minx)*s:.1f},{(maxy-p[1])*s:.1f}' for p in r)+'Z' for r in rings(f['geometry']))
        on=f['properties']['name']==region
        out.append(f'<path d="{d}" fill="{"#C8922A" if on else "#2c2b27"}" stroke="#141414" stroke-width="1.5" stroke-linejoin="round"/>')
    return f'<svg width="{W}" height="{H:.0f}" viewBox="0 0 {W} {H:.0f}">{"".join(out)}</svg>'
RIDGE='''<svg viewBox="0 0 1200 630" preserveAspectRatio="none" style="position:absolute;inset:0;width:1200px;height:630px">
<defs><radialGradient id="g" cx="820" cy="250" r="560" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#e2b866" stop-opacity="0.45"/><stop offset="1" stop-color="#c8922a" stop-opacity="0"/></radialGradient></defs>
<rect width="1200" height="630" fill="url(#g)"/>
<path d="M0 415 C 165 330 290 380 440 340 C 585 300 695 390 820 350 C 970 305 1080 372 1200 330 L1200 630 L0 630Z" fill="#2c2b27"/>
<path d="M0 498 C 185 448 350 498 512 465 C 695 428 820 498 990 468 C 1080 452 1150 482 1200 474 L1200 630 L0 630Z" fill="#1f1f1c"/>
<path d="M0 548 C 275 518 567 573 823 535 C 988 512 1116 540 1200 528" stroke="#c8922a" stroke-width="5" fill="none"/></svg>'''
TXT=lambda r: f'''<div style="position:absolute;left:72px;bottom:110px;display:flex;flex-direction:column;gap:12px">
<div style="font:700 22px Raleway;letter-spacing:5px;color:#c8922a;text-transform:uppercase">Motorcycle stops in</div>
<div style="font:400 60px Cinzel;color:#f2f0eb;line-height:1.05;max-width:760px">{html.escape(r)}</div></div>'''
MAP=lambda r: f'<div style="position:absolute;right:64px;top:56px;padding:0">{mapsvg(r,300)}</div>'
def A(r): return f'<html><body style="margin:0;width:1200px;height:630px;background:#141414;position:relative;overflow:hidden">{RIDGE}<div style="position:absolute;left:72px;top:64px;width:280px">{wm.replace("<svg ","<svg width=\"280\" ")}</div>{MAP(r)}{TXT(r)}</body></html>'
def B(r): return f'<html><body style="margin:0;width:1200px;height:630px;background:#141414;position:relative;overflow:hidden">{RIDGE}<img src="{badge}" style="position:absolute;left:52px;top:40px;width:430px">{MAP(r)}{TXT(r)}</body></html>'
REGS=sys.argv[1:]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':630})
    import os; os.makedirs('/home/claude/wvb-maps/share',exist_ok=True)
    for r in REGS:
        slug=re.sub(r'[^a-z0-9]+','-',r.lower()).strip('-')
        pg.set_content(A(r)); pg.wait_for_timeout(400)
        pg.screenshot(path=f'/home/claude/wvb-maps/share/wvb-share-{slug}.png')
    b.close()
print('ok')
