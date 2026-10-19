// WVB card-art census — Airtable source
// --------------------------------------
// Pulls the rows that need a card straight from the Airtable view the operator
// reads, so there is ONE definition of the queue.
//
// WHY A VIEW AND NOT A filterByFormula
// Airtable formulas reference fields BY NAME, so renaming a Directory column
// silently changes what this Action renders. A view ID does not move when a
// field is renamed. "5 · Render census" is filtered to: Latitude not empty AND
// Status is Verified or Published (read from the live base 2026-10-19).
//
// WHICH BASE
// Two bases share every internal ID (the frozen v1 copy and the live v2 base)
// and no longer share a schema, so the base is never assumed by habit: it is
// set here to the LIVE base and can be overridden with AIRTABLE_BASE_ID.
//
// WHY THIS FILE BUILDS THE FILENAME ITSELF
// On 2026-09-07 an exported CSV carried `Webflow Item ID`, the renderer keyed
// filenames on it, and a parallel set of orphans appeared. The filename is
// derived here from Business Name, which is also what wvb-directory-publish
// looks up when it creates a new item — so the two stay joined.
//
// Requires AIRTABLE_TOKEN — a PAT with data.records:read and write on the base.

const API = "https://api.airtable.com/v0";

export const BASE_ID = (process.env.AIRTABLE_BASE_ID || "appzKMEw0Ec7csxiO").trim(); // WVB Operations (live)
export const TABLE_ID = "tblrdWiuu1IMCydpA";       // Directory
export const CENSUS_VIEW_ID = "viw7WbMSIDu8PjJ7c"; // 5 · Render census

// Field IDs, not names. These survive a rename; names do not.
export const F = {
  businessName:  "fldbuDs7YwUJLbRpV",
  latitude:      "fldsZhYiutH4EpTJe",
  longitude:     "fldM5MLF3hk2oCYX0",
  county:        "fldXZoPCDEuOlx8f9",
  travelRegion:  "fldEZaoeG2Ysjxtih",
  slug:          "fldEJxSha1zrNcfPd",
  webflowItemId: "fldmECdcKoFrKMrBv",
  featuredImage: "fldLffD66AMcXeaXw", // a real photo here outranks the card art
  mapRendered:   "fldartrM3My5DQI1y",
  needsRender:   "fld5AYGdwDvfvYKjn",
};

export function requireToken() {
  const t = (process.env.AIRTABLE_TOKEN || "").trim();
  if (!t) {
    throw new Error(
      "AIRTABLE_TOKEN is not set. Add a repo secret named AIRTABLE_TOKEN " +
      `(a PAT with data.records:read and data.records:write on base ${BASE_ID}).`
    );
  }
  return t;
}

function asText(v) {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(", ");
  if (typeof v === "object") return String(v.name ?? v.value ?? "");
  return String(v);
}

export function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function fetchCensus({ token, viewId = CENSUS_VIEW_ID, pageDelayMs = 250 } = {}) {
  const records = [];
  let offset;
  do {
    const qs = new URLSearchParams({ view: viewId, returnFieldsByFieldId: "true", pageSize: "100" });
    for (const id of [F.businessName, F.latitude, F.longitude, F.county, F.travelRegion,
                      F.slug, F.webflowItemId, F.featuredImage, F.needsRender]) {
      qs.append("fields[]", id);
    }
    if (offset) qs.set("offset", offset);

    const res = await fetch(`${API}/${BASE_ID}/${TABLE_ID}?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Airtable read failed ${res.status}: ${await res.text()}`);
    const body = await res.json();
    records.push(...body.records);
    offset = body.offset;
    if (offset) await new Promise(r => setTimeout(r, pageDelayMs));
  } while (offset);

  // RECORD_IDS narrows the run to named rows — the one-record proof before a
  // batch. It still only accepts rows the census view returns.
  const only = String(process.env.RECORD_IDS || "").split(/[\s,]+/).filter(Boolean);
  if (only.length) {
    const picked = records.filter(r => only.includes(r.id));
    const missing = only.filter(id => !records.some(r => r.id === id));
    if (missing.length) {
      console.log(`RECORD_IDS not in the census view (no pin, or not Verified/Published): ${missing.join(", ")}`);
    }
    console.log(`RECORD_IDS — rendering ${picked.length} named row(s), ignoring Needs Render.`);
    return picked;
  }

  // THE VIEW IS THE INPUT; `Needs Render` IS THE DECISION.
  // RENDER_ALL=1 renders every row the view returns — the one-time switch from
  // the old map tiles to the card art, or any later deliberate rebuild.
  if (String(process.env.RENDER_ALL ?? "").trim() === "1") {
    console.log(`RENDER_ALL=1 — rendering all ${records.length} row(s) the view returned, ignoring Needs Render.`);
    return records;
  }

  const needed = records.filter(r => String((r.fields || {})[F.needsRender] || "").trim());
  const skipped = records.length - needed.length;
  if (skipped) {
    console.log(`View returned ${records.length} row(s); ${skipped} already have a current card ` +
                `(empty Needs Render) and were skipped. Use RENDER_ALL=1 to force a full re-render.`);
  }
  return needed;
}

export function toRow(rec) {
  const f = rec.fields || {};
  const name = asText(f[F.businessName]).trim();
  const lat = parseFloat(asText(f[F.latitude]));
  const lng = parseFloat(asText(f[F.longitude]));
  const storedSlug = asText(f[F.slug]).trim();
  const photo = Array.isArray(f[F.featuredImage]) && f[F.featuredImage].length > 0;

  return {
    recordId: rec.id,
    name,
    // Filename key: Business Name, so wvb-directory-publish finds it by name.
    file: `dir-${slugify(name)}.png`,
    // Seed key: the stored Slug per the spec, falling back to the name slug.
    seedSlug: storedSlug || slugify(name),
    county: asText(f[F.county]).trim(),
    region: asText(f[F.travelRegion]).trim(),
    webflowItemId: asText(f[F.webflowItemId]).trim(),
    hasPhoto: photo,
    lat,
    lng,
    hasCoords: Number.isFinite(lat) && Number.isFinite(lng),
  };
}
