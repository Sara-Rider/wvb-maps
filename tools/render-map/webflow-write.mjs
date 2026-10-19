// WVB card art -> Webflow
// -----------------------
// Points `featured-image` on each listing's Webflow item at its new card.
// Runs AFTER the PNGs are committed and pushed, and BEFORE Map Rendered is
// stamped: a stamp claims the listing's card is current, so a listing whose
// Webflow write failed must not be stamped.
//
// THE URL IS PINNED TO THE COMMIT. raw.githubusercontent.com/.../main/... is
// CDN-cached and has served hours-stale files (2026-09-07). A file overwritten
// under the same name could hand Webflow the OLD pin map. A /<commit-sha>/ URL
// never changes content, so Webflow always ingests the card this run drew.
//
// LIVE vs DRAFT. A published item takes the /live endpoint, which writes and
// publishes this one field only — any other edits sitting staged on the item
// are not pushed live by this step. A draft item takes the staged endpoint and
// goes live with the next normal publish. Same branch as sync_listing_urls.py.
//
// NEVER BLANK. The request carries a URL or is not sent.
//
// Requires WEBFLOW_API_TOKEN with CMS write, COMMIT_SHA (the pushed commit).

import fs from "node:fs";
import path from "node:path";

const API = "https://api.webflow.com/v2";
const COLLECTION = "6a402eec052b0585b4a0452e"; // Directories
const FIELD = "featured-image";
const REPO = process.env.GITHUB_REPOSITORY || "Sara-Rider/wvb-maps";
const SHA = (process.env.COMMIT_SHA || "").trim();
const TOKEN = (process.env.WEBFLOW_API_TOKEN || "").trim();
const GAP_MS = 1100; // stay under Webflow's 60 requests/minute

const manifestPath = process.env.RENDERED_MANIFEST
  || path.resolve(process.cwd(), "..", "..", "renders", "rendered-records.json");

if (!fs.existsSync(manifestPath)) { console.log("No manifest — nothing to write."); process.exit(0); }
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const rows = manifest.rendered || [];
if (!rows.length) { console.log("Manifest is empty — nothing to write."); process.exit(0); }

if (!/^[0-9a-f]{40}$/.test(SHA)) throw new Error(`COMMIT_SHA is not a commit hash: "${SHA}"`);
if (!TOKEN) throw new Error("WEBFLOW_API_TOKEN is not set.");

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function call(method, url, body) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json", accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      const wait = (parseInt(res.headers.get("retry-after") || "60", 10) || 60) * 1000;
      console.log(`  rate-limited, waiting ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: res.status, ok: res.ok, json, text };
  }
  return { status: 429, ok: false, json: null, text: "still rate-limited after 3 tries" };
}

let denied = false;
for (const r of rows) {
  const imageUrl = `https://raw.githubusercontent.com/${REPO}/${SHA}/renders/${r.filename}`;

  if (!r.webflowItemId) {
    // Not on the site yet. wvb-directory-publish finds this card by Business
    // Name in /renders when it creates the item.
    Object.assign(r, { webflow: "not-on-site", stamp: true });
    console.log(`not on site    ${r.name}`);
    continue;
  }
  if (r.hasPhoto) {
    // A real photo in Airtable Featured Image outranks the card art.
    Object.assign(r, { webflow: "real-photo-kept", stamp: true });
    console.log(`photo kept     ${r.name}`);
    continue;
  }
  if (denied) { Object.assign(r, { webflow: "skipped-no-permission", stamp: false }); continue; }

  const got = await call("GET", `${API}/collections/${COLLECTION}/items/${r.webflowItemId}`);
  await sleep(GAP_MS);
  if (got.status === 401 || got.status === 403) {
    denied = true;
    Object.assign(r, { webflow: "no-permission", stamp: false, detail: `HTTP ${got.status}` });
    console.log(`NO PERMISSION  WEBFLOW_API_TOKEN cannot read/write CMS items (HTTP ${got.status}). Stopping Webflow writes.`);
    continue;
  }
  if (got.status === 404) {
    Object.assign(r, { webflow: "item-missing", stamp: false, detail: "Webflow Item ID not found in the Directories collection" });
    console.log(`ITEM MISSING   ${r.name} — Airtable carries ${r.webflowItemId}, Webflow has no such item`);
    continue;
  }
  if (!got.ok) {
    Object.assign(r, { webflow: "error", stamp: false, detail: `GET HTTP ${got.status} ${got.text.slice(0, 200)}` });
    console.log(`ERROR          ${r.name} — ${r.detail}`);
    continue;
  }

  const item = got.json || {};
  const isLive = item.isDraft === false && Boolean(item.lastPublished) && item.isArchived !== true;
  const url = `${API}/collections/${COLLECTION}/items/${r.webflowItemId}${isLive ? "/live" : ""}`;
  const put = await call("PATCH", url, { fieldData: { [FIELD]: { url: imageUrl, alt: r.name } } });
  await sleep(GAP_MS);

  if (put.status === 401 || put.status === 403) {
    denied = true;
    Object.assign(r, { webflow: "no-permission", stamp: false, detail: `HTTP ${put.status}` });
    console.log(`NO PERMISSION  WEBFLOW_API_TOKEN cannot write CMS items (HTTP ${put.status}). Give the token CMS write scope.`);
    continue;
  }
  const newUrl = put.json?.fieldData?.[FIELD]?.url;
  if (!put.ok || !newUrl) {
    Object.assign(r, { webflow: "error", stamp: false, detail: `PATCH HTTP ${put.status} ${put.text.slice(0, 200)}` });
    console.log(`ERROR          ${r.name} — ${r.detail}`);
    continue;
  }
  Object.assign(r, { webflow: isLive ? "written-live" : "written-staged", stamp: true, webflowImage: newUrl });
  console.log(`${isLive ? "live  " : "staged"}         ${r.name}`);
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const count = s => rows.filter(r => r.webflow === s).length;
const lines = [
  `### Card art written to Webflow`,
  ``,
  `| Result | Listings |`, `|---|---|`,
  `| Live card replaced and published | ${count("written-live")} |`,
  `| Draft item updated (goes live on next publish) | ${count("written-staged")} |`,
  `| Not on the site yet (publish picks the card up by name) | ${count("not-on-site")} |`,
  `| Real photo kept | ${count("real-photo-kept")} |`,
  `| **Not written — Map Rendered left as it was** | ${rows.filter(r => !r.stamp).length} |`,
];
const failed = rows.filter(r => !r.stamp);
if (failed.length) {
  lines.push("", "Not written:");
  for (const r of failed) lines.push(`- ${r.name}: ${r.webflow}${r.detail ? ` — ${r.detail}` : ""}`);
}
console.log("\n" + lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n\n");
