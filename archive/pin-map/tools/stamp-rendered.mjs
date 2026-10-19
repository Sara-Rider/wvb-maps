// WVB render write-back — stamp Map Rendered
// -------------------------------------------
// THIS IS THE STEP THAT DID NOT EXIST. render-batch.yml wrote a render-index.csv
// "for the write-back step" and there was no write-back step, so `Map Rendered`
// had to be typed by hand on every row and the census never cleared itself.
//
// Reads renders/rendered-records.json (written by render-batch.mjs) and PATCHes
// Map Rendered on exactly those records.
//
// ORDER MATTERS. This runs AFTER the commit+push succeeds. A stamp says "a tile
// for this pin exists in the repo" — stamping before the push would claim a tile
// that a failed push never delivered, and `Needs Render` would go quiet on a
// listing that still has no picture. That is worse than no stamp at all.
//
// Requires AIRTABLE_TOKEN with data.records:write.

import fs from "node:fs";
import path from "node:path";
import { BASE_ID, TABLE_ID, F, requireToken } from "./airtable-source.mjs";

const API = "https://api.airtable.com/v0";
const BATCH = 10;          // Airtable's PATCH ceiling
const DELAY_MS = 250;      // stay under 5 requests/second

const manifestPath = process.env.RENDERED_MANIFEST
  || path.resolve(process.cwd(), "..", "..", "renders", "rendered-records.json");

if (!fs.existsSync(manifestPath)) {
  console.log(`No manifest at ${manifestPath} — nothing to stamp.`);
  process.exit(0);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const rendered = (manifest.rendered || []).filter(r => r.recordId);

if (!rendered.length) {
  console.log("Manifest is empty — nothing to stamp. (A CSV-source run does not produce record IDs.)");
  process.exit(0);
}

const token = requireToken();
const stamp = new Date().toISOString();

let ok = 0;
const failures = [];

for (let i = 0; i < rendered.length; i += BATCH) {
  const chunk = rendered.slice(i, i + BATCH);
  const payload = {
    records: chunk.map(r => ({ id: r.recordId, fields: { [F.mapRendered]: stamp } })),
    typecast: false,
  };

  const res = await fetch(`${API}/${BASE_ID}/${TABLE_ID}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (res.ok) {
    ok += chunk.length;
    console.log(`stamped ${chunk.length}  (${ok}/${rendered.length})`);
  } else {
    const detail = await res.text();
    console.log(`FAILED batch ${i / BATCH + 1}: ${res.status} ${detail}`);
    for (const r of chunk) failures.push({ ...r, status: res.status });
  }

  if (i + BATCH < rendered.length) await new Promise(r => setTimeout(r, DELAY_MS));
}

console.log(`\nMap Rendered stamped on ${ok} of ${rendered.length} records at ${stamp}.`);

if (failures.length) {
  console.log("\nNOT STAMPED — these have a tile in the repo but no stamp, so they");
  console.log("will keep reading NEVER RENDERED until they are stamped or re-run:");
  for (const f of failures) console.log(`  - ${f.name} (${f.recordId})`);
  // A tile that exists without a stamp is a safe, visible state: the census
  // still asks for it. Do NOT fail the job over it — the renders are committed
  // and re-running is harmless.
}
