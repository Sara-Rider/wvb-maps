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
    gpx/<slug>.gpx           AUTHORED, preferred. The same GPX riders download.
                             Must be exported from Furkot with the DETAILED
                             TRACK option enabled, or it carries turn points
                             instead of road geometry and the line cuts corners.
                             One Furkot export serves both the rider download
                             and the map.

    tracks/<slug>.geojson    AUTHORED, legacy. Honoured when no GPX exists, for
                             routes done before the GPX path was added.

    routes/<slug>.geojson    GENERATED. Overwritten on every run. The road plus
                             one Point per stop, read live from the route's The
                             Stops reference.

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
import xml.etree.ElementTree as ET

import requests

from gpx_track import parse_gpx   # simplify() is used by the all-routes index feed, not here

API = "https://api.webflow.com/v2"
ROUTES_COLLECTION_ID = "6a4024b595fb0b707c589010"
DIRECTORY_COLLECTION_ID = "6a402eec052b0585b4a0452e"
TRAVEL_REGIONS_COLLECTION_ID = "6a559020e2cb0cdf4ac5d4ca"

TOKEN = os.environ.get("WEBFLOW_API_TOKEN") or os.environ.get("WEBFLOW_TOKEN")
HDRS = {"Authorization": f"Bearer {TOKEN}", "accept": "application/json"}

GPX_DIR = "gpx"        # authored: the same GPX riders download
TRACK_DIR = "tracks"   # legacy authored GeoJSON, still honoured
OUT_DIR = "routes"     # generated, overwritten every run

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
    """Read the authored road geometry. Returns (features, note).

    Looks for the GPX first, because that is the file the founder already
    produces for riders to download — one Furkot export, one artifact, no hand
    conversion. Falls back to a committed GeoJSON track for routes done before
    that changed.

        gpx/<slug>.gpx           preferred. Must be exported from Furkot with
                                 the DETAILED TRACK option on, or it carries
                                 turn points instead of road geometry.
        tracks/<slug>.geojson    legacy, still honoured.
    """
    gpx_path = os.path.join(GPX_DIR, f"{slug}.gpx")
    if os.path.exists(gpx_path):
        try:
            segments, source, meta = parse_gpx(gpx_path)
        except Exception as exc:                       # malformed XML
            return [], f"{slug}: {gpx_path} could not be parsed ({exc})"
        if not segments:
            return [], (f"{slug}: {gpx_path} contains no drawable geometry "
                        f"(trkpt={meta['trkpt']} rtept={meta['rtept']} "
                        f"wpt={meta['wpt']}). Re-export from Furkot with the "
                        "detailed track option enabled.")
        geom = ({"type": "LineString", "coordinates": segments[0]}
                if len(segments) == 1
                else {"type": "MultiLineString", "coordinates": segments})
        note = None
        if source == "rtept":
            note = (f"{slug}: built from route points, not a track, so the line "
                    "cuts corners. Re-export from Furkot with the detailed "
                    "track option enabled.")
        return [{"type": "Feature", "geometry": geom, "properties": {}}], note

    geo_path = os.path.join(TRACK_DIR, f"{slug}.geojson")
    if not os.path.exists(geo_path):
        return [], None
    with open(geo_path, encoding="utf-8") as fh:
        fc = json.load(fh)
    feats = fc.get("features") if isinstance(fc, dict) else None
    if feats is None:                      # a bare geometry, not a collection
        feats = [{"type": "Feature", "geometry": fc, "properties": {}}]
    return ([f for f in feats
             if (f.get("geometry") or {}).get("type")
             in ("LineString", "MultiLineString")], None)


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
    seen_slugs = set()

    for route in all_items(ROUTES_COLLECTION_ID):
        fd = route.get("fieldData", {})
        slug = (fd.get("slug") or "").strip()
        name = (fd.get("name") or "").strip()
        if not slug:
            findings.append(f"route {route['id']} has no slug")
            continue

        features = []
        seen_slugs.add(slug)

        # ---- the road ------------------------------------------------
        track, track_note = load_track(slug)
        if track_note:
            findings.append(track_note)
        if not track:
            notes.append(f"{slug}: no gpx/{slug}.gpx and no tracks/{slug}.geojson "
                         "— feed will carry stops only, and the route page will "
                         "draw pins with no line")
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

    # ---- a GPX matching no route is the failure mode that just bit us --
    # A file named for the route TITLE rather than the SLUG is invisible to
    # load_track and produces a silent "no track" note. Name it here instead.
    if os.path.isdir(GPX_DIR):
        for fn in sorted(os.listdir(GPX_DIR)):
            if not fn.lower().endswith(".gpx"):
                continue
            if fn[:-4] not in seen_slugs:
                findings.append(
                    f"{GPX_DIR}/{fn} matches no published route slug. Rename it "
                    f"to <slug>.gpx. Known slugs: {', '.join(sorted(seen_slugs))}")

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
