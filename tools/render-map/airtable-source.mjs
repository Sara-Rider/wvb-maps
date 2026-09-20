// WVB render census — Airtable source
// ------------------------------------
// Replaces the committed directory.csv hand-off. Pulls the rows that need a
// tile straight from the Airtable view the operator reads, so there is ONE
// definition of the queue instead of two that can drift.
//
// WHY A VIEW AND NOT A filterByFormula
// Airtable formulas reference fields BY NAME, so renaming a Directory column
// silently changes what this Action renders (this is exactly how Make D2 is
// fragile). A view ID does not move when a field is renamed, and the view
// "5 · Render census" already encodes the queue: Needs Render is not empty.
// If the queue definition ever changes, it changes in one place, in Airtable,
// and both the operator and this Action follow it.
//
// WHY THIS FILE BUILDS THE FILENAME ITSELF
// On 2026-09-07 an exported CSV happened to carry `Webflow Item ID`, the
// renderer keyed filenames on it, and the run produced a parallel set of
// `dir-<itemid>.png` orphans while the real `dir-<name-slug>.png` tiles went
// stale — and every "does the file exist" check still passed. The hidden-field
// state of a view was load-bearing. It is not any more: the ID is derived here,
// from Business Name, and no Airtable column can override it.
//
// Requires AIRTABLE_TOKEN — a PAT with data.records:read on the WVB Operations
// base. Never hardcode it; the workflow passes it as a secret.

const API = "https://api.airtable.com/v0";

export const BASE_ID = "apperKKJ9nZkf62lI";        // WVB Operations
export const TABLE_ID = "tblrdWiuu1IMCydpA";       // Directory
export const CENSUS_VIEW_ID = "viw7WbMSIDu8PjJ7c"; // 5 · Render census

// Field IDs, not names. These survive a rename; names do not.
export const F = {
  businessName:     "fldbuDs7YwUJLbRpV",
  businessCategory: "fldl7AMocaQOLVFLS",
  attractionType:   "fld2tt4jYE4dpFJPt",
  typeToken:        "fldHKAjLvHU5vweQC",
  latitude:         "fldsZhYiutH4EpTJe",
  longitude:        "fldM5MLF3hk2oCYX0",
  certified:        "fldvxG0n5947z9veU",
  mapRendered:      "fldartrM3My5DQI1y",
  needsRender:      "fld5AYGdwDvfvYKjn",
};

export function requireToken() {
  const t = (process.env.AIRTABLE_TOKEN || "").trim();
  if (!t) {
    throw new Error(
      "AIRTABLE_TOKEN is not set. Add a repo secret named AIRTABLE_TOKEN " +
      "(a PAT scoped to the WVB Operations base with data.records:read and " +
      "data.records:write), or run with SOURCE=csv to use the legacy " +
      "directory.csv hand-off."
    );
  }
  return t;
}

// Airtable returns singleSelect/multipleSelect as strings or arrays depending on
// the field; a linked/lookup value can arrive as an array too. Flatten to text.
function asText(v) {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(", ");
  if (typeof v === "object") return String(v.name ?? v.value ?? "");
  return String(v);
}

export async function fetchCensus({ token, viewId = CENSUS_VIEW_ID, pageDelayMs = 250 } = {}) {
  const records = [];
  let offset;
  do {
    const qs = new URLSearchParams({
      view: viewId,
      returnFieldsByFieldId: "true",
      pageSize: "100",
    });
    for (const id of [F.businessName, F.businessCategory, F.attractionType,
                      F.typeToken, F.latitude, F.longitude, F.certified,
                      F.needsRender]) {
      qs.append("fields[]", id);
    }
    if (offset) qs.set("offset", offset);

    const res = await fetch(`${API}/${BASE_ID}/${TABLE_ID}?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Airtable read failed ${res.status}: ${await res.text()}`);
    }
    const body = await res.json();
    records.push(...body.records);
    offset = body.offset;
    if (offset) await new Promise(r => setTimeout(r, pageDelayMs)); // 5 req/sec ceiling
  } while (offset);

  // THE VIEW IS THE INPUT; `Needs Render` IS THE DECISION.
  //
  // We do not trust the view's filter to be the queue, because a view filter
  // cannot be read back through the API and two readings of this view are on
  // record: "Needs Render is not empty" (the 09-19 rebuild) and "Latitude not
  // empty AND Status is Verified or Published" (wvb-directory-publish step 0,
  // which argues for a COVERAGE CENSUS on purpose). Both return nearly the same
  // count today, so a row count cannot tell them apart.
  //
  // So the field decides, not the filter. Whichever way the view is filtered,
  // this renders exactly the rows that `Needs Render` says need a tile — and it
  // stays correct if someone edits the view.
  //
  // RENDER_ALL=1 renders every row the view returns, ignoring `Needs Render`.
  // That is the coverage re-render the publish skill's census argument is for:
  // use it to rebuild the whole folder, not for a normal run.
  const renderAll = String(process.env.RENDER_ALL ?? "").trim() === "1";
  if (renderAll) {
    console.log(`RENDER_ALL=1 — rendering all ${records.length} row(s) the view returned, ignoring Needs Render.`);
    return records;
  }

  const needed = records.filter(r => String((r.fields || {})[F.needsRender] || "").trim());
  const skipped = records.length - needed.length;
  if (skipped) {
    console.log(
      `View returned ${records.length} row(s); ${skipped} already have a current tile ` +
      `(empty Needs Render) and were skipped. Use RENDER_ALL=1 to force a full re-render.`
    );
  }
  if (!needed.length && records.length) {
    console.log("Every row the view returned already has a current tile.");
  }

  return needed;
}

// Maps an Airtable record to the exact row shape loadRows() produces, plus
// `recordId` so the write-back knows what to stamp. `slug` and
// `resolveGlyphToken` are passed in so this file never owns a second copy of
// the glyph rules (Decision 61 — one classification, computed once).
export function toRow(rec, { slug, resolveGlyphToken, GLYPHS }) {
  const f = rec.fields || {};
  const name = asText(f[F.businessName]).trim();
  const category = asText(f[F.businessCategory]).trim();
  const attraction = asText(f[F.attractionType]).trim();

  const lat = parseFloat(asText(f[F.latitude]));
  const lng = parseFloat(asText(f[F.longitude]));

  const stored = asText(f[F.typeToken]).trim().toLowerCase();
  const derived = resolveGlyphToken(category, attraction);
  const glyph = stored || derived;

  return {
    recordId: rec.id,
    // Derived here on purpose — see the header note about the 09-07 orphan run.
    id: slug(name),
    name,
    category,
    glyph,
    derived,
    tokenSource: stored ? "stored" : "derived",
    disagrees: Boolean(stored) && stored !== derived,
    unknown: !GLYPHS[glyph],
    certified: f[F.certified] === true,
    lat,
    lng,
    hasCoords: Number.isFinite(lat) && Number.isFinite(lng),
  };
}
