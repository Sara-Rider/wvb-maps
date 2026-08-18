// WVB directory map thumbnails - BATCH
// -----------------------------------
// Reads directory.csv, renders one 1200x675 map thumbnail per row (locked
// defaults zoom 12.5 / pin 110), commits nothing here (the workflow commits).
// Renders EVERY row with coordinates. It does NOT decide whether a row already
// has a real photo - that precedence ("never overwrite a real photo") is
// enforced later at write-back time, so this step is safe and can re-run freely.
//
// DRY_RUN=1 skips the browser and just prints the resolved manifest - use it to
// sanity-check parsing + glyph mapping without rendering.
//
// Expected directory.csv columns (header row, case-insensitive; extra columns ignored):
//   ID (Webflow Item ID preferred; else any stable id) - optional, falls back to a name slug
//   Business Name
//   Business Category      (one of the 13 canonical values)
//   Attraction Type        (optional; used only when Business Category = Attraction)
//   Type Token             (optional but PREFERRED - the stored glyph token; see below)
//   Latitude
//   Longitude
//   Certified              (optional; true/1/yes = gold ring pin)
//
// GLYPH SOURCE OF TRUTH (Decision 61 - one classification, computed once):
// when a row carries `Type Token`, that value IS the glyph and nothing is
// re-derived. resolveGlyphToken() below is a FALLBACK for rows that lack it.
// Every fallback is counted in the run log, so a mismatch between what the CMS
// stored and what this renderer would have guessed is visible, not silent.

import fs from "node:fs";
import path from "node:path";
// puppeteer is imported lazily below (only when actually rendering) so DRY_RUN works without it

const SLATE = "#3D5A6B";
const GOLD = "#C8922A";
const MIST = "#F2F0EB";

const ZOOM = parseFloat(process.env.IN_ZOOM ?? "12.5");
const PIN = parseInt(process.env.IN_PIN ?? "110", 10);
const DRY_RUN = String(process.env.DRY_RUN ?? "").trim() === "1";
const CSV_PATH = process.env.CSV_PATH || path.resolve(process.cwd(), "directory.csv");
const REPO = process.env.GITHUB_REPOSITORY || "Sara-Rider/wvb-maps";
const REF = process.env.GITHUB_REF_NAME || "main";

const WIDTH = 1200;
const HEIGHT = 675;

// ---- Glyph set (24x24, outline, stroke = glyph color) ----
const GLYPHS = {
  overlook: '<circle cx="7.5" cy="15" r="4"/><circle cx="16.5" cy="15" r="4"/><path d="M7.5 11V7"/><path d="M16.5 11V7"/><path d="M7.5 7h9"/>',
  waterfall: '<path d="M12 3c2.5 3.5 5 6.7 5 9a5 5 0 0 1-10 0c0-2.3 2.5-5.5 5-9z"/>',
  bridge: '<path d="M3 17v-3a9 9 0 0 1 18 0v3"/><path d="M3 14h18"/><path d="M8 14v3"/><path d="M12 14v3"/><path d="M16 14v3"/>',
  monument: '<path d="M5 9h14l-7-6z"/><path d="M9 9v10"/><path d="M15 9v10"/><path d="M6 21h12"/>',
  park: '<path d="M12 3l4.5 7H14l3.5 5.5H15L18 20H6l3-4.5H6.5L10 10H7.5z"/><path d="M12 20v2"/>',
  "scenic-road": '<path d="M17 4a2.5 2.5 0 1 1 0 5h-4a2.5 2.5 0 1 0 0 5h4a2.5 2.5 0 1 1 0 5H7"/>',
  swing: '<path d="M4 4h16"/><path d="M8 4v6"/><path d="M16 4v6"/><path d="M7 10h10v3H7z"/><path d="M9 13v4"/><path d="M15 13v4"/>',
  food: '<path d="M6 3v6a2 2 0 0 0 4 0V3"/><path d="M8 3v18"/><path d="M16 3c-1.5 1.2-2 3.5-2 6 0 1.7 1 2.5 2 2.5V3"/><path d="M16 11.5V21"/>',
  lodging: '<path d="M4 8v10"/><path d="M4 14h16"/><path d="M20 18v-4a2 2 0 0 0-2-2h-8v2"/><circle cx="7.5" cy="11" r="1.5"/>',
  camping: '<path d="M12 4l8 15H4z"/><path d="M12 4v15"/>',
  fuel: '<path d="M5 20V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v15"/><path d="M4 20h11"/><path d="M7 8h5"/><path d="M14 10l3 3v4a2 2 0 0 0 4 0V8l-3-3"/>',
  moto: '<path d="M15 6.5a3.5 3.5 0 0 0-4.7 4.6L4 17.5 6.5 20l6.4-6.3A3.5 3.5 0 0 0 17.5 9l-2 2-1.5-1.5z"/>',
  guides: '<circle cx="12" cy="12" r="8.5"/><path d="M15 9l-4.5 1.5L9 15l4.5-1.5z"/>',
  attraction: '<path d="M12 3l2.5 6H21l-5 4 2 6.5L12 15l-6 4.5 2-6.5-5-4h6.5z"/>',
  other: '<circle cx="12" cy="12" r="3.2"/>',
};

// Business Category (13 canonical) -> glyph token
const CATEGORY_TO_GLYPH = {
  "lodging": "lodging",
  "restaurant": "food",
  "bar": "food",              // mug is a deferred custom mark (Decision 37); ships as food glyph for now
  "campground": "camping",
  "motorcycle dealer": "moto",
  "repair shop": "moto",
  "fuel": "fuel",
  "attraction": "attraction", // may be overridden by Attraction Type below
  "tour guide": "guides",
  "outfitter": "guides",
  "paint shop": "moto",
  "tire shop": "moto",
  "other": "other",
};

// Attraction Type -> glyph token (used only when category = Attraction and a value is present)
const ATTRACTION_TO_GLYPH = {
  "overlook": "overlook",
  "waterfall": "waterfall",
  "covered bridge": "bridge",
  "bridge": "bridge",
  "monument": "monument",
  "park": "park",
  "nature": "park",
  "park/nature": "park",
  "scenic road": "scenic-road",
  "byway": "scenic-road",
  "scenic road/byway": "scenic-road",
  "swing": "swing",
};

function resolveGlyphToken(category, attractionType) {
  const cat = (category || "").trim().toLowerCase();
  const at = (attractionType || "").trim().toLowerCase();
  if (cat === "attraction" && at && ATTRACTION_TO_GLYPH[at]) return ATTRACTION_TO_GLYPH[at];
  if (CATEGORY_TO_GLYPH[cat]) return CATEGORY_TO_GLYPH[cat];
  return "other";
}

function isCertified(v) {
  const s = (v || "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "checked";
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// ---- Minimal RFC-4180-ish CSV parser (handles quotes, commas, newlines in quotes) ----
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ""));
}

function loadRows() {
  const raw = fs.readFileSync(CSV_PATH, "utf8");
  const grid = parseCSV(raw);
  if (grid.length < 2) throw new Error("directory.csv has no data rows");
  const header = grid[0].map(h => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name);
  const firstCol = (names) => { for (const n of names) { const i = header.indexOf(n); if (i >= 0) return i; } return -1; };
  const iId = firstCol(["id", "webflow id", "webflow item id", "webflow-id"]);
  const iName = col("business name");
  const iCat = col("business category");
  const iAtt = col("attraction type");
  const iTok = firstCol(["type token", "type-token", "typetoken"]);
  const iLat = col("latitude");
  const iLng = col("longitude");
  const iCert = col("certified");
  if (iName < 0 || iCat < 0 || iLat < 0 || iLng < 0) {
    throw new Error("directory.csv must include columns: Business Name, Business Category, Latitude, Longitude");
  }
  return grid.slice(1).map((r) => {
    const name = (r[iName] || "").trim();
    const lat = parseFloat(r[iLat]);
    const lng = parseFloat(r[iLng]);

    // The stored token wins; derive only when the column is absent or empty.
    const stored = iTok >= 0 ? (r[iTok] || "").trim().toLowerCase() : "";
    const derived = resolveGlyphToken(r[iCat], iAtt >= 0 ? r[iAtt] : "");
    const glyph = stored || derived;
    const tokenSource = stored ? "stored" : "derived";
    const disagrees = Boolean(stored) && stored !== derived;
    const unknown = !GLYPHS[glyph];

    const certified = iCert >= 0 ? isCertified(r[iCert]) : false;
    const id = (iId >= 0 && r[iId] && r[iId].trim()) ? r[iId].trim() : slug(name);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
    return { id, name, category: (r[iCat] || "").trim(), glyph, derived,
             tokenSource, disagrees, unknown, certified, lat, lng, hasCoords };
  });
}

// ---- Pin + page HTML (identical logic to the single renderer) ----
function pinHtml(glyphInner, certified) {
  const size = certified ? Math.round(PIN * 1.27) : PIN;
  const glyphSize = Math.round(size * 0.5);
  const borderPx = Math.max(2, Math.round(size * 0.028));
  const teardrop = `
    <div style="width:${size}px;height:${size}px;background:${SLATE};
      border:${borderPx}px solid ${MIST};border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;">
      <svg width="${glyphSize}" height="${glyphSize}" viewBox="0 0 24 24"
        fill="none" stroke="${MIST}" stroke-width="2" stroke-linecap="round"
        stroke-linejoin="round" style="transform:rotate(45deg);">${glyphInner}</svg>
    </div>`;
  if (!certified) return teardrop;
  const ringPad = Math.round(size * 0.14);
  return `
    <div style="padding:${ringPad}px;background:${GOLD};border-radius:50%;
      border:${borderPx}px solid ${MIST};display:inline-flex;">${teardrop}</div>`;
}

function pageHtml(row) {
  const glyphInner = GLYPHS[row.glyph] || GLYPHS.other;
  const cfg = JSON.stringify({ lat: row.lat, lng: row.lng, zoom: ZOOM });
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<link href="https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet"/>
<script src="https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<style>html,body{margin:0;padding:0}#map{width:${WIDTH}px;height:${HEIGHT}px}
.wvb-pin{cursor:default;transform:translateY(2px)}</style></head>
<body><div id="map"></div>
<script>
const CFG = ${cfg};
const map = new maplibregl.Map({
  container: 'map', style: 'https://tiles.openfreemap.org/styles/positron',
  center: [CFG.lng, CFG.lat], zoom: CFG.zoom,
  attributionControl: false, interactive: false, fadeDuration: 0
});
map.on('load', () => {
  const el = document.createElement('div');
  el.className = 'wvb-pin';
  el.innerHTML = ${JSON.stringify(pinHtml(glyphInner, row.certified))};
  new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([CFG.lng, CFG.lat]).addTo(map);
  map.once('idle', () => { window.__ready = true; });
});
</script></body></html>`;
}

// ---- Main ----
const rows = loadRows();
const renderable = rows.filter(r => r.hasCoords);
const skipped = rows.filter(r => !r.hasCoords);

console.log(`Rows: ${rows.length}  |  renderable: ${renderable.length}  |  no coords (skipped): ${skipped.length}`);
console.log("Glyph resolution:");
for (const r of rows) {
  console.log(`  ${r.hasCoords ? "OK " : "-- "} ${r.category.padEnd(18)} -> ${r.glyph.padEnd(12)} [${r.tokenSource}] ${r.certified ? "[certified] " : ""}${r.name}`);
}

const fellBack = rows.filter(r => r.tokenSource === "derived");
const conflicts = rows.filter(r => r.disagrees);
const unknowns = rows.filter(r => r.unknown);
console.log(`\nToken source — stored: ${rows.length - fellBack.length}   derived (fallback): ${fellBack.length}`);
if (fellBack.length) {
  console.log("  DERIVED (no Type Token column value — publish should supply it):");
  for (const r of fellBack) console.log(`    - ${r.name} -> ${r.glyph}`);
}
if (conflicts.length) {
  console.log("  CONFLICT — stored token differs from what this renderer would derive.");
  console.log("  The STORED value is used. Investigate the mismatch, do not 'fix' it here:");
  for (const r of conflicts) console.log(`    - ${r.name}: stored=${r.glyph}  derived=${r.derived}`);
}
if (unknowns.length) {
  console.log("  UNKNOWN TOKEN — no artwork; falls back to the `other` mark:");
  for (const r of unknowns) console.log(`    - ${r.name}: ${r.glyph}`);
}
if (skipped.length) console.log("NO-COORD rows will be skipped:", skipped.map(r => r.name).join(", "));

if (DRY_RUN) { console.log("\nDRY_RUN=1 - no rendering, no files written."); process.exit(0); }

const outDir = path.resolve(process.cwd(), "..", "..", "renders");
fs.mkdirSync(outDir, { recursive: true });

const puppeteer = (await import("puppeteer")).default;
const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage",
    "--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist","--enable-webgl"],
});

const index = [["id","name","category","glyph","token_source","certified","filename","raw_url"]];
try {
  for (const row of renderable) {
    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 2 });
    const file = `dir-${row.id}.png`;
    try {
      await page.setContent(pageHtml(row), { waitUntil: "networkidle0", timeout: 60000 });
      await page.waitForFunction("window.__ready === true", { timeout: 60000 });
      await new Promise((r) => setTimeout(r, 1000));
      await page.screenshot({ path: path.join(outDir, file), clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
      const url = `https://raw.githubusercontent.com/${REPO}/${REF}/renders/${file}`;
      index.push([row.id, row.name, row.category, row.glyph, row.tokenSource, String(row.certified), file, url]);
      console.log("rendered", file);
    } catch (e) {
      console.log("FAILED", row.name, "-", e.message);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

const csvOut = index.map(r => r.map(v => /[",\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(",")).join("\n");
fs.writeFileSync(path.join(outDir, "render-index.csv"), csvOut);
console.log(`\nDone. ${index.length - 1} rendered. Index: renders/render-index.csv`);
