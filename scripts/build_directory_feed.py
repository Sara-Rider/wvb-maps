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

Requires env WEBFLOW_API_TOKEN (a read-only Webflow site token).
"""
import json
import os
from collections import Counter

import requests

WEBFLOW_TOKEN = os.environ["WEBFLOW_API_TOKEN"]
COLLECTION_ID = "6a402eec052b0585b4a0452e"   # Directory collection
API = "https://api.webflow.com/v2"
HDRS = {"Authorization": f"Bearer {WEBFLOW_TOKEN}", "accept": "application/json"}

# WV validation box — a coordinate outside this is a bad geocode, not WV.
LAT_MIN, LAT_MAX = 37.1, 40.7
LNG_MIN, LNG_MAX = -82.7, -77.6


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
    items = fetch_live_items()

    features, skipped = [], []
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
        ptype = subtype or category  # glyph driver: sub-type when present, else category
        maps = fd.get("maps-url-2") or (
            f"https://www.google.com/maps/dir/?api=1&destination={lat},{lng}"
        )

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lng, lat]},  # [lng, lat]
            "properties": {
                "id": it.get("id"),
                "name": name,
                "category": category,
                "type": ptype,
                "certified": bool(fd.get("certified")),
                "maps": maps,
                "slug": fd.get("slug"),
            },
        })

    fc = {
        "type": "FeatureCollection",
        "metadata": {
            "name": "West Virginia Bikers - Directory (all listings)",
            "purpose": "Proximity feed: distance-from-coordinates for nearby-businesses on event and route pages.",
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
    if skipped:
        print(f"SKIPPED {len(skipped)} (fix these in the directory):")
        for who, why in skipped:
            print(f"  - {who}: {why}")


if __name__ == "__main__":
    build()
