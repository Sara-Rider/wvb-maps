// WVB directory card art - BATCH
// ------------------------------
// Renders the E3 card (region over county, generated ridge landscape) for every
// row the census asks for, as a 2400x1500 PNG named dir-<business-name-slug>.png
// in /renders. The workflow commits them, writes them to Webflow
// (webflow-write.mjs) and then stamps Map Rendered (stamp-rendered.mjs).
//
// This replaced the MapLibre/OpenFreeMap pin-map tile on 2026-10-19. The card
// art needs no network: the only external input is the Raleway face, which is
// bundled from @fontsource/raleway and embedded, never fetched.
//
// DRY_RUN=1 reads the census and prints what WOULD render. No browser, no files.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { cardSvg, resolveRegion, countyLabel, W, H } from "./card-art.mjs";
import { requireToken, fetchCensus, toRow, CENSUS_VIEW_ID, BASE_ID } from "./airtable-source.mjs";

const DRY_RUN = String(process.env.DRY_RUN ?? "").trim() === "1";
const SCALE = 3; // 800x500 drawing space -> 2400x1500 PNG

// ---- Census ----
const token = requireToken();
console.log(`Source: Airtable base ${BASE_ID}, view ${CENSUS_VIEW_ID} (5 · Render census)`);
const rows = (await fetchCensus({ token })).map(toRow);
console.log(`Census returned ${rows.length} row(s) to render.`);

const outDir = path.resolve(process.cwd(), "..", "..", "renders");
fs.mkdirSync(outDir, { recursive: true });
const manifestPath = path.join(outDir, "rendered-records.json");
const writeManifest = (rendered) => fs.writeFileSync(
  manifestPath,
  JSON.stringify({ renderedAt: new Date().toISOString(), rendered }, null, 2)
);

if (!rows.length) {
  console.log("Nothing to render — every listing has a current card.");
  if (!DRY_RUN) writeManifest([]);
  process.exit(0);
}

// ---- Checks that stop a row rather than draw it wrong ----
const problems = [];
const byFile = new Map();
for (const r of rows) {
  if (!byFile.has(r.file)) byFile.set(r.file, []);
  byFile.get(r.file).push(r);
}
for (const [file, group] of byFile) {
  if (group.length > 1) {
    // Two listings with the same Business Name would overwrite each other's card
    // and cross-wire the publish lookup. Render neither; name it.
    for (const r of group) problems.push({ r, why: `shares the filename ${file} with another row — rename one in Airtable` });
  }
}
for (const r of rows) {
  if (!r.hasCoords) problems.push({ r, why: "no usable latitude/longitude" });
  else if (!r.county) problems.push({ r, why: "County is blank — the nameplate would read ' COUNTY'" });
  else if (!r.region) problems.push({ r, why: "Travel Region is blank — check County is a recognised WV county" });
}
const blocked = new Set(problems.map(p => p.r.recordId));
const renderable = rows.filter(r => !blocked.has(r.recordId));

console.log(`Renderable: ${renderable.length}  |  stopped: ${blocked.size}`);
for (const r of renderable) {
  const fallback = resolveRegion(r.region) !== r.region ? `  [colourway fallback: ${resolveRegion(r.region)}]` : "";
  console.log(`  OK  ${r.file.padEnd(58)} ${r.region} / ${countyLabel(r.county)}${fallback}`);
}
if (problems.length) {
  console.log("\nSTOPPED — not rendered, Needs Render stays set:");
  for (const p of problems) console.log(`  -- ${p.r.name} (${p.r.recordId}): ${p.why}`);
}

if (DRY_RUN) { console.log("\nDRY_RUN=1 - no rendering, no files written."); process.exit(0); }

// ---- Font: embedded, then proven loaded before anything is drawn ----
const require = createRequire(import.meta.url);
const fontB64 = (w) => fs.readFileSync(
  require.resolve(`@fontsource/raleway/files/raleway-latin-${w}-normal.woff2`)
).toString("base64");
const FONT_CSS = [600, 700].map(w =>
  `@font-face{font-family:'Raleway';font-style:normal;font-weight:${w};` +
  `src:url(data:font/woff2;base64,${fontB64(w)}) format('woff2');}`
).join("");

function pageHtml(svg) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${FONT_CSS}
html,body{margin:0;padding:0;background:#fff}svg{display:block}</style></head>
<body>${svg}</body></html>`;
}

const puppeteer = (await import("puppeteer")).default;
const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
});

const rendered = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: SCALE });

  // A missing face falls back silently and every card shifts. Prove both
  // weights load before the first card; abort the whole run if they do not.
  await page.setContent(pageHtml(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><text font-family="Raleway" font-weight="600">A</text><text font-family="Raleway" font-weight="700">A</text></svg>`));
  await page.evaluate(async () => {
    await document.fonts.load("600 23px Raleway");
    await document.fonts.load("700 38px Raleway");
  });
  const fontsOk = await page.evaluate(() =>
    document.fonts.check("600 23px Raleway") && document.fonts.check("700 38px Raleway") &&
    [...document.fonts].filter(f => f.family.replace(/['"]/g, "") === "Raleway" && f.status === "loaded").length >= 2
  );
  if (!fontsOk) throw new Error("Raleway 600/700 did not load — refusing to render cards with a fallback face.");
  console.log("\nRaleway 600 and 700 loaded.");

  for (const r of renderable) {
    try {
      const svg = cardSvg({ slug: r.seedSlug, lat: r.lat, lng: r.lng, county: r.county, region: r.region });
      await page.setContent(pageHtml(svg), { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(outDir, r.file), clip: { x: 0, y: 0, width: W, height: H } });
      rendered.push({
        recordId: r.recordId, name: r.name, filename: r.file,
        webflowItemId: r.webflowItemId, hasPhoto: r.hasPhoto,
      });
      console.log("rendered", r.file);
    } catch (e) {
      console.log("FAILED", r.name, "-", e.message);
    }
  }
} finally {
  await browser.close();
}

// Written even when empty so a stale manifest is never written to Webflow or stamped twice.
writeManifest(rendered);
console.log(`\nDone. ${rendered.length} of ${renderable.length} rendered. Manifest: renders/rendered-records.json`);
