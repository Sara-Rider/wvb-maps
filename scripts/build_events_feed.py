#!/usr/bin/env python3
"""Build events.geojson from the live Webflow Events collection.

Sibling of scripts/build_directory_feed.py. Same conventions:
  * reads PUBLISHED items only, via /items/live
  * resolves Option fields by reading the option names from the live schema,
    so a renamed option is picked up rather than silently mis-mapped
  * resolves the Travel Region reference to its name
  * keyed on `slug`, which is the only identifier stable across a republish
  * no `precision` property — precision is a gate, not a display state
    (Decision 63)

Event pin contract v1:

    slug, name, type, typeLabel, region, date, endDate,
    locationName, status, url, link, maps

`type` is the canonical event glyph token; `typeLabel` is the CMS option name
it came from. Both are emitted so the embed never has to reverse-map, and
neither can drift because both are regenerated from the same source.

GUARD THE DIRECTORY BUILDER DOES NOT HAVE
-----------------------------------------
Any coordinate shared by two or more events is reported as a hard finding.
A geocoder that cannot resolve an address falls back to a state or county
centroid, and it returns the SAME point every time it does so — which means
duplicate coordinates are the fingerprint of that failure. On 2026-08-19 two
unrelated events (Clarksburg and Ripley) both sat on 38.5976262, -80.4549026,
a point in Webster County belonging to neither. Nothing detected it for ten
days. This check is cheap and would have caught it on the first run.
"""

import json
import os
import sys
from collections import defaultdict

import requests

API = "https://api.webflow.com/v2"
SITE_ID = "6a3fd4080f5ec7334ab9f570"
EVENTS_COLLECTION_ID = "6a40315929504b278760f841"
TRAVEL_REGIONS_COLLECTION_ID = "6a559020e2cb0cdf4ac5d4ca"

# Same secret name the directory builder and its workflow already use, so one
# repo secret serves both feeds. WEBFLOW_TOKEN is accepted as a fallback for
# anyone running this by hand.
TOKEN = os.environ.get("WEBFLOW_API_TOKEN") or os.environ.get("WEBFLOW_TOKEN")
HDRS = {"Authorization": f"Bearer {TOKEN}", "accept": "application/json"}

# Event Type option name -> glyph token. Nine options, nine tokens; see
# event-glyphs.mjs, which is the one home for the marks themselves. An
# option missing from this map is reported, not silently defaulted.
EVENT_TYPE_TO_TOKEN = {
    "Rally": "rally",
    "Poker Run": "poker-run",
    "Charity Ride": "charity-ride",
    "Group Ride": "group-ride",
    "Race": "race",
    "Festival": "festival",
    "Show": "show",
    "Bike Night": "bike-night",
    "Other": "other",
}

# West Virginia plus a margin for genuinely out-of-state destination events.
LAT_RANGE = (36.0, 42.0)
LNG_RANGE = (-84.0, -76.0)


def get(url, **params):
    r = requests.get(url, headers=HDRS, params=params or None, timeout=30)
    r.raise_for_status()
    return r.json()


def option_maps():
    """{optionId: name} for every Option field on the Events collection."""
    data = get(f"{API}/collections/{EVENTS_COLLECTION_ID}")
    out = {}
    for field in data.get("fields", []):
        options = (field.get("validations") or {}).get("options")
        if options:
            out[field["slug"]] = {o["id"]: o["name"] for o in options}
    return out


def region_map():
    """{itemId: regionName} for the Travel Regions collection."""
    out, offset = {}, 0
    while True:
        data = get(f"{API}/collections/{TRAVEL_REGIONS_COLLECTION_ID}/items",
                   limit=100, offset=offset)
        for item in data.get("items", []):
            out[item["id"]] = (item.get("fieldData", {}).get("name") or "").strip()
        total = data.get("pagination", {}).get("total", len(out))
        offset += 100
        if offset >= total:
            break
    return out


def fetch_live_items():
    """All PUBLISHED event items. /items/live excludes drafts."""
    items, offset = [], 0
    while True:
        data = get(f"{API}/collections/{EVENTS_COLLECTION_ID}/items/live",
                   limit=100, offset=offset)
        items.extend(data.get("items", []))
        total = data.get("pagination", {}).get("total", len(items))
        offset += 100
        if offset >= total:
            break
    return items


def build():
    if not TOKEN:
        sys.exit("WEBFLOW_API_TOKEN is not set.")

    opts = option_maps()
    type_names = opts.get("event-type", {})
    status_names = opts.get("listing-status", {})
    regions = region_map()

    features = []
    skipped_no_coord, out_of_box, unknown_type = [], [], []
    no_region = []
    by_coord = defaultdict(list)

    for item in fetch_live_items():
        fd = item.get("fieldData", {})
        name = (fd.get("name") or "").strip()
        slug = (fd.get("slug") or "").strip()

        raw_lat, raw_lng = fd.get("latitude"), fd.get("longitude")
        if not raw_lat or not raw_lng:
            skipped_no_coord.append(name or slug)
            continue
        try:
            lat, lng = float(str(raw_lat).strip()), float(str(raw_lng).strip())
        except ValueError:
            skipped_no_coord.append(f"{name or slug} (unparseable)")
            continue

        if not (LAT_RANGE[0] <= lat <= LAT_RANGE[1]
                and LNG_RANGE[0] <= lng <= LNG_RANGE[1]):
            out_of_box.append(f"{name or slug}: {lat}, {lng}")
            continue

        label = type_names.get(fd.get("event-type"), "")
        token = EVENT_TYPE_TO_TOKEN.get(label)
        if token is None:
            token = "other"
            unknown_type.append(f"{name or slug}: {label!r}")

        region = regions.get(fd.get("travel-region"), "")
        if not region:
            no_region.append(name or slug)

        by_coord[(round(lat, 6), round(lng, 6))].append(name or slug)

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lng, lat]},
            "properties": {
                "slug": slug,
                "name": name,
                "type": token,
                "typeLabel": label,
                "region": region,
                "date": fd.get("event-date"),
                "endDate": fd.get("end-date"),
                "locationName": (fd.get("location-name") or "").strip(),
                "status": status_names.get(fd.get("listing-status"), ""),
                "url": f"/events/{slug}",
                "link": fd.get("link"),
                "maps": ("https://www.google.com/maps/dir/?api=1&destination="
                         f"{lat},{lng}"),
            },
        })

    fc = {"type": "FeatureCollection", "features": features}
    with open("events.geojson", "w", encoding="utf-8") as fh:
        json.dump(fc, fh, ensure_ascii=False, indent=1)
        fh.write("\n")

    # ---- report -------------------------------------------------------
    print(f"events.geojson written: {len(features)} features")

    slugs = [f["properties"]["slug"] for f in features]
    if len(set(slugs)) != len(slugs):
        print("FAIL duplicate slugs in feed")
    if skipped_no_coord:
        print(f"  skipped, no coordinate ({len(skipped_no_coord)}): "
              + ", ".join(skipped_no_coord))
    if out_of_box:
        print(f"  FAIL outside the validation box ({len(out_of_box)}): "
              + "; ".join(out_of_box))
    if unknown_type:
        print(f"  FAIL Event Type with no token ({len(unknown_type)}): "
              + "; ".join(unknown_type)
              + " — add it to EVENT_TYPE_TO_TOKEN and draw a mark.")
    if no_region:
        print(f"  WARN no Travel Region ({len(no_region)}): "
              + ", ".join(no_region))

    shared = {c: names for c, names in by_coord.items() if len(names) > 1}
    if shared:
        print(f"  FAIL {len(shared)} coordinate(s) shared by more than one "
              "event. A repeated point is the fingerprint of a geocoder "
              "falling back to a state or county centroid:")
        for (lat, lng), names in shared.items():
            print(f"    {lat}, {lng} <- " + " | ".join(names))
        print("    Do not derive region from a shared coordinate. Establish "
              "the venue, or clear the coordinate so no pin is drawn.")
    else:
        print("  ok every coordinate is unique")


if __name__ == "__main__":
    build()
