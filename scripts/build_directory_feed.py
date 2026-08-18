#!/usr/bin/env python3
"""
Repo path: scripts/build_directory_feed.py

Rebuild directory.geojson from the LIVE Webflow directory. Runs in GitHub
Actions (.github/workflows/refresh-directory-feed.yml).

Reads PUBLISHED directory items via the Webflow CMS API, reshapes each into a
[lng, lat] proximity feature with lean properties, validates against the WV
box, and writes directory.geojson at the repo root — the file jsDelivr serves.

Category/attraction-type names are pulled from the collection schema at runtime,
so adding a new option in Webflow needs no code change.

Pin data contract: keyed on `slug`, one glyph token in `type`. The token is READ
from the published `type-token` field, never re-derived when it is present
(Decision 61 — one classification, computed once). derive_type_token() below
exists only as a fallback for a row that has no stored token, and every fallback
is counted in the run log so drift is visible rather than silent.

Requires env WEBFLOW_API_TOKEN (a read-only Webflow site token).
"""
import json
import os
from collections import Counter

import requests

WEBFLOW_TOKEN = os.environ["WEBFLOW_API_TOKEN"]
COLLECTION_ID = "6a402eec052b0585b4a0452e"   # Directory collection
TRAVEL_REGIONS_COLLECTION_ID = "6a559020e2cb0cdf4ac5d4ca"
API = "https://api.webflow.com/v2"
HDRS = {"Authorization": f"Bearer {WEBFLOW_TOKEN}", "accept": "application/json"}

# WV validation box — a coordinate outside this is a bad geocode, not WV.
LAT_MIN, LAT_MAX = 37.1, 40.7
LNG_MIN, LNG_MAX = -82.7, -77.6


# ---------------------------------------------------------------------------
# Glyph vocabulary — the renderer's tokens are canonical (Decision 61).
# Mirrors tools/render-map/render-batch.mjs. Used ONLY as a fallback when a row
# has no stored `type-token`.
# ---------------------------------------------------------------------------
CATEGORY_TO_TOKEN = {
    "lodging": "lodging",
    "restaurant": "food",
    "bar": "food",
    "campground": "camping",
    "motorcycle dealer": "moto",
    "repair shop": "moto",
    "tire shop": "moto",
    "paint shop": "moto",
    "fuel": "fuel",
    "attraction": "attraction",   # may be overridden by Attraction Type
    "tour guide": "guides",
    "outfitter": "guides",
    "other": "other",
}

ATTRACTION_TO_TOKEN = {
    "covered bridge": "bridge",
    "bridge": "bridge",
    "swing": "swing",
    "waterfall": "waterfall",
    "overlook": "overlook",
    "monument": "monument",
    "park/nature": "park",
    "park": "park",
    "nature": "park",
    "scenic road/byway": "scenic-road",
    "scenic road": "scenic-road",
    "byway": "scenic-road",
}

VALID_TOKENS = set(CATEGORY_TO_TOKEN.values()) | set(ATTRACTION_TO_TOKEN.values())


def derive_type_token(category, attraction_type):
    """Fallback only. Prefer the stored `type-token`."""
    cat = (category or "").strip().lower()
    at = (attraction_type or "").strip().lower()
    if cat == "attraction" and at in ATTRACTION_TO_TOKEN:
        return ATTRACTION_TO_TOKEN[at]
    return CATEGORY_TO_TOKEN.get(cat, "other")


def region_map():
    """Return {itemId: regionName} for the Travel Regions collection, so the
    feed can carry the region facet the directory index map filters on."""
    out, offset = {}, 0
    while True:
        r = requests.get(
            f"{API}/collections/{TRAVEL_REGIONS_COLLECTION_ID}/items",
            headers=HDRS, params={"limit": 100, "offset": offset}, timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        for it in data.get("items", []):
            out[it["id"]] = (it.get("fieldData", {}).get("name") or "").strip()
        total = data.get("pagination", {}).get("total", len(out))
        offset += 100
        if offset >= total:
            break
    return out


def option_maps():
    """Return {optionId: name} maps for business-category and attraction-type,
    read from the live collection schema so new options are handled automatically."""
    r = requests.get(f"{API}/collections/{COLLECTION_ID}", headers=HDRS, timeout=30)
    r.raise_for_status()
    cat, atype = {}, {}
    for field in r.json().get("fields", []):
        options = (field.get("validations") or {}).get("options")
        if not options:
            continue
        if field["slug"] == "business-category":
            target = cat
        elif field["slug"] == "attraction-type":
            target = atype
        else:
            continue
        for opt in options:
            target[opt["id"]] = opt["name"]
    return cat, atype


def fetch_live_items():
    """All PUBLISHED directory items. The /items/live endpoint returns published
    records only, so drafts are skipped without any extra filtering."""
    items, offset = [], 0
    while True:
        r = requests.get(
            f"{API}/collections/{COLLECTION_ID}/items/live",
            headers=HDRS, params={"limit": 100, "offset": offset}, timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        items.extend(data.get("items", []))
        total = data.get("pagination", {}).get("total", len(items))
        offset += 100
        if offset >= total:
            break
    return items


def build():
    cat_map, atype_map = option_maps()
    reg_map = region_map()
    items = fetch_live_items()

    features, skipped = [], []
    derived, unknown_token = [], []
    for it in items:
        fd = it.get("fieldData", {})
        name = (fd.get("name") or "").strip()
        try:
            lat = float(fd.get("latitude"))
            lng = float(fd.get("longitude"))
        except (TypeError, ValueError):
            skipped.append((name or it.get("id"), "missing/invalid coordinates"))
            continue
        if not (LAT_MIN <= lat <= LAT_MAX and LNG_MIN <= lng <= LNG_MAX):
            skipped.append((name, f"outside WV box ({lat}, {lng})"))
            continue

        category = cat_map.get(fd.get("business-category"), "Other")
        subtype = atype_map.get(fd.get("attraction-type"))
        slug = fd.get("slug")

        # The stored token wins. Derive only when it is absent (Decision 61).
        ptype = (fd.get("type-token") or "").strip()
        if not ptype:
            ptype = derive_type_token(category, subtype)
            derived.append(name or slug)
        elif ptype not in VALID_TOKENS:
            unknown_token.append(f"{name or slug}: {ptype}")

        maps = fd.get("maps-url-2") or (
            f"https://www.google.com/maps/dir/?api=1&destination={lat},{lng}"
        )

        features.append({
            "type": "Feature",
            "id": slug,                                                # join key
            "geometry": {"type": "Point", "coordinates": [lng, lat]},   # [lng, lat]
            "properties": {
                "slug": slug,
                "name": name,
                "category": category,
                "type": ptype,
                "region": reg_map.get(fd.get("travel-region"), ""),
                "county": (fd.get("county") or "").strip(),
                "certified": bool(fd.get("certified")),
                "url": f"/directory/{slug}",
                "maps": maps,
            },
        })

    fc = {
        "type": "FeatureCollection",
        "metadata": {
            "name": "West Virginia Bikers - Directory (all listings)",
            "purpose": "Pin feed: directory index map, plus distance-from-coordinates for nearby-businesses on event and route pages.",
            "contract": "pin data contract v2 — keyed on slug; `type` is the canonical renderer glyph token",
            "join_key": "slug",
            "coordinate_order": "[longitude, latitude]",
            "count": len(features),
        },
        "features": features,
    }
    with open("directory.geojson", "w", encoding="utf-8") as f:
        json.dump(fc, f, ensure_ascii=False, indent=2)

    # Console summary — visible in the Action run log.
    print(f"live items fetched: {len(items)}")
    print(f"features written:   {len(features)}")
    print(f"certified:          {sum(1 for x in features if x['properties']['certified'])}")
    print("by type/glyph:     ", dict(Counter(x["properties"]["type"] for x in features)))
    print(f"token read from CMS: {len(features) - len(derived)}   derived as fallback: {len(derived)}")
    if derived:
        print("  DERIVED (no stored type-token — publish should set it):")
        for who in derived:
            print(f"    - {who}")
    if unknown_token:
        print("  UNKNOWN TOKEN (not in the canonical 15 — vocabulary drift):")
        for who in unknown_token:
            print(f"    - {who}")
    missing_region = [x["properties"]["name"] for x in features if not x["properties"]["region"]]
    if missing_region:
        print(f"  NO TRAVEL REGION ({len(missing_region)}) — these cannot be region-filtered:")
        for who in missing_region:
            print(f"    - {who}")
    if skipped:
        print(f"SKIPPED {len(skipped)} (fix these in the directory):")
        for who, why in skipped:
            print(f"  - {who}: {why}")


if __name__ == "__main__":
    build()
