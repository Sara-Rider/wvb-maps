#!/usr/bin/env python3
"""Build one map feed per published route: routes/<slug>.geojson

Third sibling of build_directory_feed.py and build_events_feed.py.

WHY ONE FILE PER ROUTE
----------------------
The Routes Template embed serves every route, so it cannot hold a hardcoded
feed URL — it did, pointing at Summersville, which meant publishing any second
route would have drawn Summersville's line on it. The embed now derives its
feed from the route slug in the URL: /routes/<slug> fetches
routes/<slug>.geojson. Convention, no CMS fields, no bound attributes.

INPUT AND OUTPUT ARE DIFFERENT DIRECTORIES — this matters
---------------------------------------------------------
    tracks/<slug>.geojson    AUTHORED. The road geometry, exported from Furkot
                             and committed by hand. Never written by this
                             script. One LineString or MultiLineString.

    routes/<slug>.geojson    GENERATED. Overwritten on every run. The authored
                             track plus one Point per stop, read live from the
                             route's The Stops reference.

Same shape as directory.csv (authored) -> directory.geojson (generated). If you
edit a file under routes/ by hand, the next run silently discards it.

FEED CONTRACT — one FeatureCollection, mixed geometry, told apart by type:

    LineString / MultiLineString   the road
      properties: kind="track", slug, name, miles, difficulty, surface,
                  region, gpx

    Point                          a stop, in ride order
      properties: kind="stop", order, slug, name, category, type, region,
                  county, certified, url, maps

`type` on a stop is the canonical 15-token directory glyph, read from
type-token and never re-derived (Decision 66). `order` is the position in The
Stops, which is author-controlled (Decision 64) — the ride sequence, not
alphabetical, not distance-sorted.
"""

import json
import os
import sys

import requests

API = "https://api.webflow.com/v2"
ROUTES_COLLECTION_ID = "6a4024b595fb0b707c589010"
DIRECTORY_COLLECTION_ID = "6a402eec052b0585b4a0452e"
TRAVEL_REGIONS_COLLECTION_ID = "6a559020e2cb0cdf4ac5d4ca"

TOKEN = os.environ.get("WEBFLOW_API_TOKEN") or os.environ.get("WEBFLOW_TOKEN")
HDRS = {"Authorization": f"Bearer {TOKEN}", "accept": "application/json"}

TRACK_DIR = "tracks"
OUT_DIR = "routes"

VALID_TOKENS = {
    "overlook", "waterfall", "bridge", "monument", "park", "scenic-road",
    "swing", "lodging", "food", "camping", "moto", "fuel", "guides", "other",
    "attraction",
}


def get(url, **params):
    r = requests.get(url, headers=HDRS, params=params or None, timeout=30)
    r.raise_for_status()
    return r.json()


def all_items(collection_id, live=True):
    path = "items/live" if live else "items"
    items, offset = [], 0
    while True:
        data = get(f"{API}/collections/{collection_id}/{path}",
                   limit=100, offset=offset)
        items.extend(data.get("items", []))
        total = data.get("pagination", {}).get("total", len(items))
        offset += 100
        if offset >= total:
            break
    return items


def option_names(collection_id):
    """{fieldSlug: {optionId: name}} for every Option field on a collection."""
    data = get(f"{API}/collections/{collection_id}")
    out = {}
    for field in data.get("fields", []):
        options = (field.get("validations") or {}).get("options")
        if options:
            out[field["slug"]] = {o["id"]: o["name"] for o in options}
    return out


def region_names():
    return {it["id"]: (it.get("fieldData", {}).get("name") or "").strip()
            for it in all_items(TRAVEL_REGIONS_COLLECTION_ID, live=False)}


def load_track(slug):
    """Read the authored track. Returns a list of features, or [] if none."""
    path = os.path.join(TRACK_DIR, f"{slug}.geojson")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as fh:
        fc = json.load(fh)
    feats = fc.get("features") if isinstance(fc, dict) else None
    if feats is None:                      # a bare geometry, not a collection
        feats = [{"type": "Feature", "geometry": fc, "properties": {}}]
    return [f for f in feats
            if (f.get("geometry") or {}).get("type")
            in ("LineString", "MultiLineString")]


def build():
    if not TOKEN:
        sys.exit("WEBFLOW_API_TOKEN is not set.")

    os.makedirs(OUT_DIR, exist_ok=True)

    regions = region_names()
    route_opts = option_names(ROUTES_COLLECTION_ID)
    difficulty = route_opts.get("difficulty", {})
    surface = route_opts.get("surface-type", {})

    directory = {it["id"]: it.get("fieldData", {})
                 for it in all_items(DIRECTORY_COLLECTION_ID)}

    # Business Category option names, read from the live schema so a renamed
    # option is picked up rather than silently mis-mapped. Note the current
    # names are NOT the canonical singulars — the live values include
    # "Attraction \\ Sight to See" and "Motorcycle Dealers". The popup shows
    # this string verbatim; the glyph comes from type-token, never from here.
    dir_categories = option_names(DIRECTORY_COLLECTION_ID).get(
        "business-category", {})

    written, findings, notes = [], [], []

    for route in all_items(ROUTES_COLLECTION_ID):
        fd = route.get("fieldData", {})
        slug = (fd.get("slug") or "").strip()
        name = (fd.get("name") or "").strip()
        if not slug:
            findings.append(f"route {route['id']} has no slug")
            continue

        features = []

        # ---- the road ------------------------------------------------
        track = load_track(slug)
        if not track:
            notes.append(f"{slug}: no tracks/{slug}.geojson — feed will carry "
                         "stops only, and the embed will draw pins with no line")
        for f in track:
            f["properties"] = {
                "kind": "track",
                "slug": slug,
                "name": name,
                "miles": fd.get("miles"),
                "difficulty": difficulty.get(fd.get("difficulty"), ""),
                "surface": surface.get(fd.get("surface-type"), ""),
                "region": regions.get(fd.get("travel-region"), ""),
                "gpx": fd.get("gpx-download-link-2"),
            }
            features.append(f)

        # ---- the stops, in authored order ----------------------------
        stop_ids = fd.get("related-businesses") or []
        if not stop_ids:
            notes.append(f"{slug}: The Stops is empty")

        for i, item_id in enumerate(stop_ids, start=1):
            d = directory.get(item_id)
            if d is None:
                findings.append(f"{slug}: stop {item_id} is not a published "
                                "directory item — it is a draft, or deleted")
                continue

            raw_lat, raw_lng = d.get("latitude"), d.get("longitude")
            if not raw_lat or not raw_lng:
                findings.append(f"{slug}: stop \"{d.get('name')}\" has no "
                                "coordinate and cannot be drawn")
                continue
            try:
                lat, lng = float(str(raw_lat).strip()), float(str(raw_lng).strip())
            except ValueError:
                findings.append(f"{slug}: stop \"{d.get('name')}\" has an "
                                f"unparseable coordinate {raw_lat!r},{raw_lng!r}")
                continue

            token = (d.get("type-token") or "").strip().lower()
            if token not in VALID_TOKENS:
                findings.append(f"{slug}: stop \"{d.get('name')}\" has "
                                f"type-token {token!r}, which is not one of the "
                                "canonical 15")
                token = "other"

            dslug = (d.get("slug") or "").strip()
            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lng, lat]},
                "properties": {
                    "kind": "stop",
                    "order": i,
                    "slug": dslug,
                    "name": (d.get("name") or "").strip(),
                    "category": dir_categories.get(
                        d.get("business-category"), ""),
                    "type": token,
                    # The embed's "Along this ride" list shows this under the
                    # name. The old hand-built pins file carried it as `short`;
                    # keeping the property name means the list code is unchanged.
                    "short": (d.get("short-description") or "").strip(),
                    "region": regions.get(d.get("travel-region"), ""),
                    "county": (d.get("county") or "").strip(),
                    "certified": bool(d.get("certified")),
                    "url": f"/directory/{dslug}",
                    "website": d.get("website-2"),
                    "tel": d.get("tel-link"),
                    "maps": d.get("maps-url-2")
                            or ("https://www.google.com/maps/dir/?api=1"
                                f"&destination={lat},{lng}"),
                },
            })

        out_path = os.path.join(OUT_DIR, f"{slug}.geojson")
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump({"type": "FeatureCollection", "features": features},
                      fh, ensure_ascii=False, indent=1)
            fh.write("\n")

        tracks = sum(1 for f in features if f["properties"]["kind"] == "track")
        stops = sum(1 for f in features if f["properties"]["kind"] == "stop")
        written.append(f"{out_path}  {tracks} track, {stops} stops")

    # ---- report -------------------------------------------------------
    print(f"{len(written)} route feed(s) written:")
    for w in written:
        print("  " + w)
    for n in notes:
        print("  NOTE " + n)
    for f in findings:
        print("  FAIL " + f)
    if not findings:
        print("  ok no hard findings")


if __name__ == "__main__":
    build()
