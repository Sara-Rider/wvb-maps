#!/usr/bin/env python3
"""Build one map feed per published route: routes/<slug>.geojson

Repo path: scripts/build_route_feed.py
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

    routes/<slug>.geojson    GENERATED. Overwritten on every run. The road, one
                             Point per curated stop, and one Point per nearby
                             business the corridor calculation selected.

Same shape as directory.csv (authored) -> directory.geojson (generated). If you
edit a file under routes/ by hand, the next run silently discards it.

FEED CONTRACT — one FeatureCollection, mixed geometry, told apart by `kind`:

    LineString / MultiLineString   kind="track"     the road
      slug, name, miles, trackMiles, difficulty, surface, region, gpx

    Point                          kind="stop"      a curated stop, ride order
      order, slug, name, category, type, short, region, county, certified,
      url, website, tel, maps

    Point                          kind="nearby"    a computed corridor listing
      slug, name, category, type, lane, laneLabel, short, region, county,
      certified, featured, reserved, offRouteMiles, routeMile, url, website,
      tel, maps

`type` is the canonical 15-token directory glyph, read from type-token and
never re-derived (Decision 66). `order` on a stop is the position in The Stops,
which is author-controlled (Decision 64) — the ride sequence, not alphabetical,
not distance-sorted. `lane` on a nearby listing is the 8-lane collapse of those
tokens; see scripts/corridor.py for why 15 becomes 8.

THIS SCRIPT WRITES TO THE CMS
------------------------------
Every other feed builder is read-only against Webflow. This one is not: it
writes the computed corridor back to each route's Nearby Businesses field, so
a native Collection List can render the rail as real, indexed, crawlable links
instead of pins that only exist inside a canvas element. That is the whole
reason the field exists.

The write is narrow on purpose:
  * one field, on one collection, never anything else
  * skipped entirely when the computed set matches what is already there, so a
    no-op run does not republish six items and churn lastPublished
  * refused when the computed set is EMPTY but the stored one is not, because
    that pattern is the signature of a failed geometry load, not of a corridor
    that genuinely emptied. Set WVB_FORCE_EMPTY=1 to override deliberately.
  * skipped entirely with WVB_SKIP_CMS=1, which leaves the map feeds intact

Requires env WEBFLOW_API_TOKEN. Note this token now needs CMS WRITE scope; a
read-only token still builds every feed correctly and reports the write as
skipped rather than failing the run.
"""

import json
import os
import re
import sys

import requests

from gpx_track import parse_gpx, simplify
import Corridor as C

API = "https://api.webflow.com/v2"
ROUTES_COLLECTION_ID = "6a4024b595fb0b707c589010"
DIRECTORY_COLLECTION_ID = "6a402eec052b0585b4a0452e"
TRAVEL_REGIONS_COLLECTION_ID = "6a559020e2cb0cdf4ac5d4ca"

NEARBY_FIELD = "nearby-businesses"
STOPS_FIELD = "related-businesses"

TOKEN = os.environ.get("WEBFLOW_API_TOKEN") or os.environ.get("WEBFLOW_TOKEN")
HDRS = {"Authorization": f"Bearer {TOKEN}", "accept": "application/json"}

SKIP_CMS = os.environ.get("WVB_SKIP_CMS") == "1"
FORCE_EMPTY = os.environ.get("WVB_FORCE_EMPTY") == "1"
# Prints the raw stored reference value when a write is triggered. Only useful
# while diagnosing a guard that will not settle; noisy otherwise.
DEBUG_CMS = os.environ.get("WVB_DEBUG_CMS") == "1"

GPX_DIR = "gpx"        # authored: the same GPX riders download
TRACK_DIR = "tracks"   # legacy authored GeoJSON, still honoured
OUT_DIR = "routes"     # generated, overwritten every run
INDEX_OUT = "routes-index.geojson"   # generated, feeds the /routes map

# Tolerance for the all-routes index feed. Six full tracks are ~1.5 MB of
# coordinates; at the zoom where you can see all of West Virginia at once, a
# 4,878-vertex line and a 48-vertex line are the same picture. Route PAGES
# always get full fidelity — this decimation applies to the index only.
INDEX_TOLERANCE_MILES = 0.15

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


def _norm_name(filename):
    """Furkot export naming -> slug form. 'The_Cheat_River_Loop.gpx' becomes
    'the-cheat-river-loop'. Deterministic: lowercase, underscores and spaces to
    hyphens, collapse repeats. Not fuzzy matching — a fixed transformation
    between two known naming conventions."""
    stem = re.sub(r"\.gpx$", "", filename, flags=re.I)
    stem = re.sub(r"[\s_]+", "-", stem.strip().lower())
    stem = re.sub(r"-{2,}", "-", stem).strip("-")
    return stem


def _dethe(s):
    """Furkot keeps the leading 'The'; some Webflow slugs drop it. Compare both
    ways so 'the-head-of-the-dragon' finds the route 'head-of-the-dragon'."""
    return s[4:] if s.startswith("the-") else s


def index_gpx():
    """Map every GPX in gpx/ to the route slug it belongs to.

    Returns (by_slug, collisions). Accepting the exporter's own filename
    removes the step that failed three times: renaming five files by hand,
    consistently, before every run. The mapping is printed on every run, so a
    file matching the wrong route is visible rather than silent."""
    by_slug, collisions = {}, []
    if not os.path.isdir(GPX_DIR):
        return by_slug, collisions
    for fn in sorted(os.listdir(GPX_DIR)):
        if not fn.lower().endswith(".gpx"):
            continue
        key = _dethe(_norm_name(fn))
        if key in by_slug:
            collisions.append((key, by_slug[key], fn))
            continue
        by_slug[key] = fn
    return by_slug, collisions


def load_track(slug, gpx_index=None):
    """Read the authored road geometry. Returns (segments, note).

    segments is a list of coordinate lists, [[lon, lat], ...] — the same shape
    gpx_track.parse_gpx returns, so the drawn line and the corridor measurement
    come from one geometry rather than two.

        gpx/<slug>.gpx           preferred. Must be exported from Furkot with
                                 the DETAILED TRACK option on, or it carries
                                 turn points instead of road geometry.
        tracks/<slug>.geojson    legacy, still honoured.
    """
    gpx_path = os.path.join(GPX_DIR, f"{slug}.gpx")
    if not os.path.exists(gpx_path) and gpx_index:
        fn = gpx_index.get(_dethe(slug))
        if fn:
            gpx_path = os.path.join(GPX_DIR, fn)
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
        note = None
        if source == "rtept":
            note = (f"{slug}: built from route points, not a track, so the line "
                    "cuts corners AND the corridor is measured against a line "
                    "the road does not follow. Re-export from Furkot with the "
                    "detailed track option enabled.")
        return segments, note

    geo_path = os.path.join(TRACK_DIR, f"{slug}.geojson")
    if not os.path.exists(geo_path):
        return [], None
    with open(geo_path, encoding="utf-8") as fh:
        fc = json.load(fh)
    feats = fc.get("features") if isinstance(fc, dict) else None
    if feats is None:                      # a bare geometry, not a collection
        feats = [{"type": "Feature", "geometry": fc}]
    segments = []
    for f in feats:
        g = f.get("geometry") or {}
        if g.get("type") == "LineString":
            segments.append(g["coordinates"])
        elif g.get("type") == "MultiLineString":
            segments.extend(g["coordinates"])
    return segments, None


def track_feature(segments, props):
    geom = ({"type": "LineString", "coordinates": segments[0]}
            if len(segments) == 1
            else {"type": "MultiLineString", "coordinates": segments})
    return {"type": "Feature", "geometry": geom, "properties": props}


# ---- the candidate pool ------------------------------------------------

def directory_candidates(directory, dir_categories, regions):
    """Every published directory listing that can be measured, as a flat list.

    Built once and reused for all six routes. A listing with no coordinate is
    dropped here rather than per route, so the run log names it once instead of
    six times.
    """
    pool, no_coord = [], []
    for item_id, d in directory.items():
        name = (d.get("name") or "").strip()
        try:
            lat = float(str(d.get("latitude")).strip())
            lng = float(str(d.get("longitude")).strip())
        except (TypeError, ValueError):
            no_coord.append(name or item_id)
            continue
        token = (d.get("type-token") or "").strip().lower()
        if token not in VALID_TOKENS:
            token = "other"
        dslug = (d.get("slug") or "").strip()
        pool.append({
            "id": item_id,
            "slug": dslug,
            "name": name,
            "lon": lng,
            "lat": lat,
            "type": token,
            "lane": C.lane_for(token),
            "category": dir_categories.get(d.get("business-category"), ""),
            "short": (d.get("short-description") or "").strip(),
            "region": regions.get(d.get("travel-region"), ""),
            "county": (d.get("county") or "").strip(),
            "certified": bool(d.get("certified")),
            "featured": C.is_featured(d.get("featured-until")),
            "website": d.get("website-2"),
            "tel": d.get("tel-link"),
            "maps": d.get("maps-url-2")
                    or ("https://www.google.com/maps/dir/?api=1"
                        f"&destination={lat},{lng}"),
        })
    return pool, no_coord


def nearby_feature(c):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [c["lon"], c["lat"]]},
        "properties": {
            "kind": "nearby",
            "slug": c["slug"],
            "name": c["name"],
            "category": c["category"],
            "type": c["type"],
            "lane": c["lane"],
            "laneLabel": C.LANE_LABEL.get(c["lane"], "Other"),
            "short": c["short"],
            "region": c["region"],
            "county": c["county"],
            "certified": c["certified"],
            "featured": c["featured"],
            "reserved": bool(c.get("reserved")),
            "offRouteMiles": c["off_miles"],
            "routeMile": c["route_mile"],
            "url": f"/directory/{c['slug']}",
            "website": c["website"],
            "tel": c["tel"],
            "maps": c["maps"],
        },
    }


# ---- writing the rail back to the CMS ----------------------------------

def ref_ids(value):
    """Normalise a MultiReference value to a plain list of item id strings.

    The staged and live item endpoints do not have to serialise a reference
    the same way, and they don't always: one returns bare id strings, the
    other can return objects. Comparing those two shapes never matches, so the
    skip-when-unchanged guard silently degrades into "write every run" —
    exactly the churn the guard exists to prevent. Accept both shapes rather
    than trust either.
    """
    out = []
    for v in value or []:
        if isinstance(v, str):
            out.append(v)
        elif isinstance(v, dict):
            got = v.get("id") or v.get("_id") or v.get("itemId")
            if got:
                out.append(str(got))
    return out


def push_nearby(route_id, is_draft, item_ids, current):
    """Write the computed rail to the route's Nearby Businesses field.

    Returns (status, detail). Never raises — a CMS failure must not cost the
    map feeds, which are already written by the time this runs.
    """
    if SKIP_CMS:
        return "skipped", "WVB_SKIP_CMS=1"

    stored = ref_ids(current)
    if stored == item_ids:
        return "unchanged", ""

    # Say WHY this run is writing. A bare "written-live" on a run with
    # identical inputs looks like success and is actually a broken guard; the
    # only way to tell the two apart from a log is to print the comparison.
    if not stored:
        why = "stored 0 — field empty, or absent from the live response"
    elif set(stored) == set(item_ids):
        why = f"stored {len(stored)}, same set but different order"
    else:
        added = len(set(item_ids) - set(stored))
        gone = len(set(stored) - set(item_ids))
        why = f"stored {len(stored)}, +{added} -{gone}"
    if DEBUG_CMS:
        why += f" | raw={str(current)[:160]}"

    if not item_ids and stored and not FORCE_EMPTY:
        return "refused", ("computed rail is empty but the stored one is not — "
                           "this is what a failed geometry load looks like. "
                           "Set WVB_FORCE_EMPTY=1 if the emptying is real.")

    # A draft route has no live record to patch; write staged and let the
    # founder's publish carry it.
    suffix = "" if is_draft else "/live"
    url = f"{API}/collections/{ROUTES_COLLECTION_ID}/items/{route_id}{suffix}"
    try:
        r = requests.patch(
            url,
            headers={**HDRS, "content-type": "application/json"},
            json={"fieldData": {NEARBY_FIELD: item_ids}},
            timeout=30,
        )
    except requests.RequestException as exc:
        return "error", str(exc)
    if r.status_code in (401, 403):
        return "no-permission", (
            f"HTTP {r.status_code} — WEBFLOW_API_TOKEN cannot write CMS items. "
            "Give the token CMS write scope, or set WVB_SKIP_CMS=1 to stop "
            "attempting the write.")
    if not r.ok:
        return "error", f"HTTP {r.status_code} {r.text[:200]}"
    return (("written-staged" if is_draft else "written-live"),
            f"{len(item_ids)} refs ({why})")


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

    pool, no_coord = directory_candidates(directory, dir_categories, regions)

    written, findings, notes, cms_log = [], [], [], []
    index_features, index_skipped, renamed = [], [], []
    seen_slugs = set()
    gpx_index, gpx_collisions = index_gpx()
    matched_files = set()
    for key, fn, other in gpx_collisions:
        findings.append(f"{GPX_DIR}/{fn} and {GPX_DIR}/{other} both resolve to "
                        f"the same route '{key}'. Remove or rename one.")

    for route in all_items(ROUTES_COLLECTION_ID):
        fd = route.get("fieldData", {})
        slug = (fd.get("slug") or "").strip()
        name = (fd.get("name") or "").strip()
        if not slug:
            findings.append(f"route {route['id']} has no slug")
            continue

        features = []
        seen_slugs.add(slug)
        if route.get("isDraft"):
            notes.append(f"{slug}: route item is a DRAFT — the feed is built, "
                         "but /routes/{0} is not live yet".format(slug))

        # ---- the road ------------------------------------------------
        segments, track_note = load_track(slug, gpx_index)
        if _dethe(slug) in gpx_index:
            fn = gpx_index[_dethe(slug)]
            matched_files.add(fn)
            if fn != f"{slug}.gpx":
                renamed.append(f"{fn} -> {slug}")
        if track_note:
            findings.append(track_note)

        road = C.Corridor(segments) if segments else None
        if not segments:
            notes.append(f"{slug}: no gpx/{slug}.gpx and no tracks/{slug}.geojson "
                         "— feed will carry stops only, no line and no nearby "
                         "rail (the corridor needs geometry to measure against)")
        else:
            cms_miles = fd.get("miles")
            if cms_miles:
                pct = (road.miles - cms_miles) / cms_miles * 100.0
                if abs(pct) > 3.0:
                    # A NOTE, not a FAIL. The feed this run produced is CORRECT:
                    # the line is drawn from real geometry and the corridor is
                    # measured against it. What disagrees is the CMS Miles
                    # number a rider reads on the page. That is a data problem
                    # to fix in the CMS or by re-exporting the track, not a
                    # reason to fail a build whose output is good. Failing here
                    # would leave the Action red until someone edits a number,
                    # which teaches everyone to ignore a red Action.
                    notes.append(
                        f"{slug}: track measures {road.miles:.0f} mi but the CMS "
                        f"Miles field says {cms_miles} ({pct:+.0f}%). One of the "
                        "two is stale. Either re-export the GPX with the detailed "
                        "track option, or correct Miles in the CMS — riders plan "
                        "fuel and daylight around that number.")
            features.append(track_feature(segments, {
                "kind": "track",
                "slug": slug,
                "name": name,
                "miles": cms_miles,
                "trackMiles": round(road.miles, 1),
                "difficulty": difficulty.get(fd.get("difficulty"), ""),
                "surface": surface.get(fd.get("surface-type"), ""),
                "region": regions.get(fd.get("travel-region"), ""),
                "gpx": fd.get("gpx-download-link-2"),
            }))

        # ---- the stops, in authored order ----------------------------
        stop_ids = fd.get(STOPS_FIELD) or []
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

        # ---- the nearby corridor -------------------------------------
        # A curated stop is never also a nearby listing: it is already pinned,
        # already in the ride order, and already in the body copy. Repeating it
        # in the rail would read as two different businesses with one name.
        chosen = []
        if road:
            stop_set = set(stop_ids)
            candidates = [c for c in pool if c["id"] not in stop_set]
            kept = C.gather(road, candidates)
            chosen, promoted, dropped = C.select(kept)
            features.extend(nearby_feature(c) for c in chosen)

            lanes = {}
            for c in chosen:
                lanes[c["lane"]] = lanes.get(c["lane"], 0) + 1
            lane_summary = " ".join(
                f"{ln}:{lanes[ln]}" for ln in C.LANE_ORDER if ln in lanes)
            empty = [ln for ln in C.LANE_ORDER if ln not in lanes]
            notes.append(f"{slug}: nearby {len(chosen)} of {len(kept)} in range "
                         f"[{lane_summary or 'none'}]")
            # Only worth naming the empty lanes when the rail is otherwise
            # populated. On a route with nothing at all, "0 of 0" already said
            # it, and listing all eight lanes buries the routes that do have a
            # partial gap worth acting on.
            if empty and chosen:
                notes.append(f"{slug}: no coverage in {', '.join(empty)} — "
                             "a genuine gap in the directory along this route, "
                             "not a bug")
            if promoted:
                notes.append(f"{slug}: Certified reserve promoted "
                             + ", ".join(c["name"] for c in promoted))
            if dropped:
                notes.append(f"{slug}: {len(dropped)} in-range listing(s) cut by "
                             "the 3-per-lane cap")

        # ---- the all-routes index ------------------------------------
        # A DRAFT route is deliberately excluded. Its page 404s, so drawing it
        # on /routes would be an invitation to a dead end — the one thing a
        # discovery map must never do.
        if route.get("isDraft"):
            index_skipped.append(slug)
        elif segments:
            thin = [simplify(s, INDEX_TOLERANCE_MILES) for s in segments]
            thin = [s for s in thin if len(s) >= 2]
            index_features.append({
                "type": "Feature",
                "geometry": ({"type": "LineString", "coordinates": thin[0]}
                             if len(thin) == 1
                             else {"type": "MultiLineString", "coordinates": thin}),
                "properties": {
                    "kind": "route",
                    "slug": slug,
                    "name": name,
                    "miles": fd.get("miles"),
                    "rideTime": (fd.get("ride-time") or "").strip(),
                    "difficulty": difficulty.get(fd.get("difficulty"), ""),
                    "surface": surface.get(fd.get("surface-type"), ""),
                    "region": regions.get(fd.get("travel-region"), ""),
                    "secondaryRegion": regions.get(fd.get("secondary-region"), ""),
                    "short": (fd.get("short-description") or "").strip(),
                    "image": (fd.get("featured-image") or {}).get("url"),
                    "stops": len(stop_ids),
                    "nearby": len(chosen),
                    "url": f"/routes/{slug}",
                },
            })
            # A start marker, so the index map can label a route at a zoom
            # where the lines are two pixels wide and unclickable.
            start = thin[0][0]
            index_features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": start},
                "properties": {
                    "kind": "route-start",
                    "slug": slug,
                    "name": name,
                    "miles": fd.get("miles"),
                    "region": regions.get(fd.get("travel-region"), ""),
                    "url": f"/routes/{slug}",
                },
            })

        # ---- write the feed ------------------------------------------
        out_path = os.path.join(OUT_DIR, f"{slug}.geojson")
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump({"type": "FeatureCollection", "features": features},
                      fh, ensure_ascii=False, indent=1)
            fh.write("\n")

        tracks = sum(1 for f in features if f["properties"]["kind"] == "track")
        stops = sum(1 for f in features if f["properties"]["kind"] == "stop")
        near = sum(1 for f in features if f["properties"]["kind"] == "nearby")
        written.append(f"{out_path}  {tracks} track, {stops} stops, {near} nearby")

        # ---- write the rail back to the CMS ---------------------------
        status, detail = push_nearby(
            route["id"], bool(route.get("isDraft")),
            [c["id"] for c in chosen], fd.get(NEARBY_FIELD) or [])
        cms_log.append(f"{slug}: {status}" + (f" — {detail}" if detail else ""))

    # ---- a GPX that belongs to no route -------------------------------
    # Only a FAIL when a route is ALSO missing geometry, which is the signature
    # of a naming mistake. A spare GPX alongside six healthy routes is just a
    # file waiting for its CMS item, and should not block every future run.
    routes_missing_track = [w for w in written if " 0 track," in w]
    for fn in sorted(set(gpx_index.values()) - matched_files):
        msg = (f"{GPX_DIR}/{fn} belongs to no published route. Known slugs: "
               f"{', '.join(sorted(seen_slugs))}")
        if routes_missing_track:
            findings.append(msg + " — and a route is missing its geometry, so "
                                  "this is probably a naming mismatch.")
        else:
            notes.append(msg + " — every route already has geometry, so this is "
                               "most likely a route not yet in the CMS.")

    # ---- the /routes index feed ---------------------------------------
    with open(INDEX_OUT, "w", encoding="utf-8") as fh:
        json.dump({
            "type": "FeatureCollection",
            "metadata": {
                "name": "West Virginia Bikers — all published routes",
                "purpose": "Feeds the /routes index map. Lines are simplified "
                           f"to {INDEX_TOLERANCE_MILES} mi; route pages use the "
                           "full-fidelity per-route feed.",
                "contract": "kind=route (line) and kind=route-start (point)",
                "count": sum(1 for f in index_features
                             if f["properties"]["kind"] == "route"),
            },
            "features": index_features,
        }, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    if index_skipped:
        notes.append(f"{INDEX_OUT} omits {len(index_skipped)} draft route(s) "
                     f"({', '.join(sorted(index_skipped))}) — a draft page 404s, "
                     "and the index must not link to a dead end. They appear "
                     "the run after you publish them.")

    if renamed:
        notes.append("GPX filenames matched by normalisation, not exactly: "
                     + "; ".join(renamed))

    if no_coord:
        notes.append(f"{len(no_coord)} directory listing(s) have no usable "
                     "coordinate and were excluded from every corridor: "
                     + ", ".join(sorted(no_coord)))

    # ---- report -------------------------------------------------------
    print(f"{len(written)} route feed(s) written:")
    for w in written:
        print("  " + w)
    n_index = sum(1 for f in index_features if f["properties"]["kind"] == "route")
    print(f"{INDEX_OUT}: {n_index} published route(s)")
    print(f"corridor pool: {len(pool)} published listings with coordinates")
    print("Nearby Businesses (CMS):")
    for c in cms_log:
        print("  " + c)
    for n in notes:
        print("  NOTE " + n)
    for f in findings:
        print("  FAIL " + f)
    if not findings:
        print("  ok no hard findings")


if __name__ == "__main__":
    build()
