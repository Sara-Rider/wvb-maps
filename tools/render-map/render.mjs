/ WVB directory map thumbnail — single render (test harness)
// ----------------------------------------------------------
// Renders one 1200x675 map centered on a listing's coordinates, with the
// category/attraction glyph stamped into a Mountain Slate pin (gold ring +
// larger when Certified). Purpose: eyeball zoom + pin legibility on ONE real
// listing before we batch all 58. Change the zoom input, re-run, compare.
//
// Pin + glyph rules inherit from Decision 37. The glyph paths below are
// TEST-GRADE approximations drawn to the 24x24 / ~2px-stroke grammar — good
// enough to judge legibility. Swap in exact Tabler (MIT) paths for production.

import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

// ---- Brand tokens (Decision 37 / Brand & Design System) --------------------
const SLATE = "#3D5A6B"; // Mountain Slate — base pin
const GOLD = "#C8922A";  // Route Gold — Certified ring
const MIST = "#F2F0EB";  // Mist White — glyph + pin outline

// ---- Inputs ----------------------------------------------------------------
const NAME = process.env.IN_NAME || "test-render";
const LAT = parseFloat(process.env.IN_LAT ?? "38.223373");
const LNG = parseFloat(process.env.IN_LNG ?? "-80.887608");
const ZOOM = parseFloat(process.env.IN_ZOOM ?? "12.5");
const CATEGORY = (process.env.IN_CATEGORY || "").trim().toLowerCase();
const ATTRACTION = (process.env.IN_ATTRACTION_TYPE || "").trim().toLowerCase();
const CERTIFIED = String(process.env.IN_CERTIFIED || "false").trim().toLowerCase() === "true";

const WIDTH = 1200;
const HEIGHT = 675; // 16:9, matches the tile/photo container spec

// ---- Glyph set (24x24 viewBox, outline, stroke = glyph color) --------------
// Attraction types resolve first; else Business Category; else a dot.
const GLYPHS = {
  // Attraction sub-types
  overlook: '<circle cx="7.5" cy="15" r="4"/><circle cx="16.5" cy="15" r="4"/><path d="M7.5 11V7"/><path d="M16.5 11V7"/><path d="M7.5 7h9"/>',
  waterfall: '<path d="M12 3c2.5 3.5 5 6.7 5 9a5 5 0 0 1-10 0c0-2.3 2.5-5.5 5-9z"/>',
  bridge: '<path d="M3 17v-3a9 9 0 0 1 18 0v3"/><path d="M3 14h18"/><path d="M8 14v3"/><path d="M12 14v3"/><path d="M16 14v3"/>',
  monument: '<path d="M5 9h14l-7-6z"/><path d="M9 9v10"/><path d="M15 9v10"/><path d="M6 21h12"/>',
  park: '<path d="M12 3l4.5 7H14l3.5 5.5H15L18 20H6l3-4.5H6.5L10 10H7.5z"/><path d="M12 20v2"/>',
  "scenic-road": '<path d="M17 4a2.5 2.5 0 1 1 0 5h-4a2.5 2.5 0 1 0 0 5h4a2.5 2.5 0 1 1 0 5H7"/>',
  swing: '<path d="M4 4h16"/><path d="M8 4v6"/><path d="M16 4v6"/><path d="M7 10h10v3H7z"/><path d="M9 13v4"/><path d="M15 13v4"/>',
  // Service-lane categories
  food: '<path d="M6 3v6a2 2 0 0 0 4 0V3"/><path d="M8 3v18"/><path d="M16 3c-1.5 1.2-2 3.5-2 6 0 1.7 1 2.5 2 2.5V3"/><path d="M16 11.5V21"/>',
  lodging: '<path d="M4 8v10"/><path d="M4 14h16"/><path d="M20 18v-4a2 2 0 0 0-2-2h-8v2"/><circle cx="7.5" cy="11" r="1.5"/>',
  camping: '<path d="M12 4l8 15H4z"/><path d="M12 4v15"/>',
  fuel: '<path d="M5 20V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v15"/><path d="M4 20h11"/><path d="M7 8h5"/><path d="M14 10l3 3v4a2 2 0 0 0 4 0V8l-3-3"/>',
  moto: '<path d="M15 6.5a3.5 3.5 0 0 0-4.7 4.6L4 17.5 6.5 20l6.4-6.3A3.5 3.5 0 0 0 17.5 9l-2 2-1.5-1.5z"/>',
  guides: '<circle cx="12" cy="12" r="8.5"/><path d="M15 9l-4.5 1.5L9 15l4.5-1.5z"/>',
  other: '<circle cx="12" cy="12" r="3.2"/>',
};

function resolveGlyph() {
  if (ATTRACTION && GLYPHS[ATTRACTION]) return GLYPHS[ATTRACTION];
  if (CATEGORY && GLYPHS[CATEGORY]) return GLYPHS[CATEGORY];
  return GLYPHS.other;
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// ---- Pin HTML --------------------------------------------------------------
// Teardrop: rounded box rotated -45deg; glyph counter-rotated inside.
// Certified: gold ring wrapper + larger.
function pinHtml(glyphInner, certified) {
  const size = certified ? 40 : 32;
  const glyphSize = certified ? 18 : 15;
  const teardrop = `
    <div style="width:${size}px;height:${size}px;background:${SLATE};
      border:2px solid ${MIST};border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;">
      <svg width="${glyphSize}" height="${glyphSize}" viewBox="0 0 24 24"
        fill="none" stroke="${MIST}" stroke-width="2" stroke-linecap="round"
        stroke-linejoin="round" style="transform:rotate(45deg);">${glyphInner}</svg>
    </div>`;
  if (!certified) return teardrop;
  return `
    <div style="padding:5px;background:${GOLD};border-radius:50%;
      border:2px solid ${MIST};display:inline-flex;">${teardrop}</div>`;
}

// ---- Page HTML -------------------------------------------------------------
const cfg = JSON.stringify({ lat: LAT, lng: LNG, zoom: ZOOM });
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<link href="https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet"/>
<script src="https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<style>html,body{margin:0;padding:0}#map{width:${WIDTH}px;height:${HEIGHT}px}
.wvb-pin{cursor:default;transform:translateY(2px)}</style></head>
<body><div id="map"></div>
<script>
const CFG = ${cfg};
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/positron',
  center: [CFG.lng, CFG.lat],
  zoom: CFG.zoom,
  attributionControl: false,
  interactive: false,
  fadeDuration: 0
});
map.on('load', () => {
  const el = document.createElement('div');
  el.className = 'wvb-pin';
  el.innerHTML = ${JSON.stringify(pinHtml(resolveGlyph(), CERTIFIED))};
  new maplibregl.Marker({ element: el, anchor: 'bottom' })
    .setLngLat([CFG.lng, CFG.lat]).addTo(map);
  map.once('idle', () => { window.__ready = true; });
});
</script></body></html>`;

// ---- Render ----------------------------------------------------------------
const outDir = path.resolve(process.cwd(), "..", "..", "renders");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${slug(NAME)}.png`);

const browser = await puppeteer.launch({
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--enable-webgl",
  ],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 2 });
  page.on("console", (m) => console.log("[page]", m.text()));
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));

  await page.setContent(html, { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForFunction("window.__ready === true", { timeout: 60000 });
  // small settle for tile paint under swiftshader
  await new Promise((r) => setTimeout(r, 1200));

  await page.screenshot({ path: outFile, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  console.log("Wrote", outFile);
} finally {
  await browser.close();
}
