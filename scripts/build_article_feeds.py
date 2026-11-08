#!/usr/bin/env python3
"""Build one map feed per story: articles/<slug>.geojson.

Sibling of build_events_feed.py and build_route_feed.py, and it computes
nothing they do not already compute. A story has no location of its own. Its
places come from the Directory listings it links (`related-listings`) and its
line comes from the route it links (`related-routes`) — the same way an event
takes its pin from the place it is held at.

NEARBY IS THE EVENT NEARBY RULE (Sara, 2026-11-08)
---------------------------------------------------
A one-place story's nearby places are chosen exactly as an event's are, by the
same code: build_event_nearby.gather_from_point (straight-line miles, the lane
radii in corridor.LANE_RADIUS_MILES) and corridor.select (3 per lane, the
Certified reserve). Imported, not copied, so "nearby" means the same thing on a
story and an event page. The story's own place is never its own nearby.

When nothing falls inside any lane radius (a remote place), the feed carries
the NEAREST_FALLBACK closest published listings instead, with their miles, and
`properties.nearbyFallback = true` so the embed can say so honestly. Decided
2026-11-08: a remote place still gets an answer to "what else is out here".

The embed shows none of this until the rider asks (the "Find out what else is
in this area" button); the map opens on the whole state.

THE STORY'S DATA DECIDES THE MAP (brief, 2026-10-20) — no per-story setting
--------------------------------------------------------------------------
  route   a related route that is published and has a feed
          -> the embed draws that route's own line and numbered stops
             (routes/<slug>.geojson, unchanged); story places that are not
             stops on it are drawn as unnumbered chosen pins
  single  exactly one related listing, no route
          -> that place, plus its nearby places (event Nearby rule, above)
  set     two or more related listings, no route
          -> a pin per place, no line, no numbering, no nearby
  none    nothing to draw -> the embed leaves the slot empty

TAKEDOWN
--------
Only PUBLISHED listings and routes are read (/items/live). A listing that is
unpublished or deleted drops out of the feed on the next run. Between runs the
embed also drops any story pin whose card is no longer on the page, so a card
and its pin always leave together.

Stories are read from the STAGED collection (drafts included) so a story can be
tested on the staging domain before it goes live. Nothing in a feed is private:
it is the same name, pin and description the listing already publishes.

Requires env WEBFLOW_API_TOKEN (read-only is enough).
"""

import glob
import json
import os
import sys

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import corridor as C  # noqa: E402  (is_featured, select — one definition each)
from build_route_feed import directory_candidates  # noqa: E402
from build_event_nearby import (  # noqa: E402
    gather_from_point, miles_between, nearby_feature)

# A remote place with nothing inside any lane radius shows this many of the
# closest published listings instead (Sara, 2026-11-08: "the nearest few").
NEAREST_FALLBACK = 5

API = "https://api.webflow.com/v2"
ARTICLES_COLLECTION_ID = "6aa288a1560dd5bd324ada75"
DIRECTORY_COLLECTION_ID = "6a402eec052b0585b4a0452e"
ROUTES_COLLECTION_ID = "6a4024b595fb0b707c589010"
TRAVEL_REGIONS_COLLECTION_ID = "6a559020e2cb0cdf4ac5d4ca"

TOKEN = os.environ.get("WEBFLOW_API_TOKEN") or os.environ.get("WEBFLOW_TOKEN")
HDRS = {"Authorization": f"Bearer {TOKEN}", "accept": "application/json"}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "articles")
ROUTES_DIR = os.path.join(ROOT, "routes")

# The canonical 15 + the blank-subtype attraction fallback. Same set as
# build_route_feed.py VALID_TOKENS and the GLYPH table in route-map-v5.html.
VALID_TOKENS = {
    "overlook", "waterfall", "bridge", "monument", "park", "scenic-road",
    "swing", "lodging", "food", "camping", "moto", "fuel", "guides", "other",
    "attraction",
}

LAT_RANGE = (36.0, 42.0)
LNG_RANGE = (-84.0, -76.0)


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
    data = get(f"{API}/collections/{collection_id}")
    out = {}
    for field in data.get("fields", []):
        options = (field.get("validations") or {}).get("options")
        if options:
            out[field["slug"]] = {o["id"]: o["name"] for o in options}
    return out


def ref_ids(value):
    if not value:
        return []
    if isinstance(value, str):
        return [value]
    return [v for v in value if isinstance(v, str)]


def place_feature(d, kind, categories, regions, findings, story, order=None):
    """A Directory item as a map point. Returns None (and a finding) when the
    listing cannot be drawn."""
    name = (d.get("name") or "").strip()
    try:
        lat = float(str(d.get("latitude") or "").strip())
        lng = float(str(d.get("longitude") or "").strip())
    except ValueError:
        findings.append(f"{story}: \"{name}\" has no usable coordinate and is not drawn")
        return None
    if not (LAT_RANGE[0] <= lat <= LAT_RANGE[1] and LNG_RANGE[0] <= lng <= LNG_RANGE[1]):
        findings.append(f"{story}: \"{name}\" is outside the WV box ({lat}, {lng}) and is not drawn")
        return None

    token = (d.get("type-token") or "").strip().lower()
    if token not in VALID_TOKENS:
        findings.append(f"{story}: \"{name}\" has type-token {token!r}, drawn as `other`")
        token = "other"

    slug = (d.get("slug") or "").strip()
    props = {
        "kind": kind,
        "slug": slug,
        "name": name,
        "category": categories.get(d.get("business-category"), ""),
        "type": token,
        "short": (d.get("short-description") or "").strip(),
        "region": regions.get(d.get("travel-region"), ""),
        "county": (d.get("county") or "").strip(),
        "certified": bool(d.get("certified")),
        "featured": C.is_featured(d.get("featured-until")),
        "url": f"/directory/{slug}",
        "website": d.get("website-2"),
        "tel": d.get("tel-link"),
        "maps": d.get("maps-url-2")
                or f"https://www.google.com/maps/dir/?api=1&destination={lat},{lng}",
    }
    if order is not None:
        props["order"] = order
    return {"type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lng, lat]},
            "properties": props}


def build():
    if not TOKEN:
        sys.exit("WEBFLOW_API_TOKEN is not set.")

    categories = option_names(DIRECTORY_COLLECTION_ID).get("business-category", {})
    regions = {it["id"]: (it.get("fieldData", {}).get("name") or "").strip()
               for it in all_items(TRAVEL_REGIONS_COLLECTION_ID, live=False)}
    directory = {it["id"]: it.get("fieldData", {})
                 for it in all_items(DIRECTORY_COLLECTION_ID, live=True)}
    # The same candidate pool the event and route nearby passes measure.
    pool, _ = directory_candidates(directory, categories, regions)
    routes = {it["id"]: (it.get("fieldData", {}).get("slug") or "").strip()
              for it in all_items(ROUTES_COLLECTION_ID, live=True)}
    articles = [it for it in all_items(ARTICLES_COLLECTION_ID, live=False)
                if not it.get("isArchived")]

    os.makedirs(OUT_DIR, exist_ok=True)
    written, findings, keep = [], [], set()

    for art in articles:
        fd = art.get("fieldData", {})
        story = (fd.get("slug") or "").strip()
        if not story:
            continue
        keep.add(f"{story}.geojson")

        # ---- routes: published, and with a feed the embed can draw ----
        route_slugs = []
        for rid in ref_ids(fd.get("related-routes")):
            rslug = routes.get(rid)
            if not rslug:
                findings.append(f"{story}: a related route is not published — not drawn")
                continue
            if not os.path.exists(os.path.join(ROUTES_DIR, f"{rslug}.geojson")):
                findings.append(f"{story}: route {rslug} has no routes/{rslug}.geojson — "
                                "run Rebuild route map feeds")
                continue
            route_slugs.append(rslug)

        # ---- the story's places, in the order the story lists them ----
        places = []
        for lid in ref_ids(fd.get("related-listings")):
            d = directory.get(lid)
            if d is None:
                findings.append(f"{story}: a related listing is not published — "
                                "its card and pin are both off the page")
                continue
            f = place_feature(d, "place", categories, regions, findings, story)
            if f:
                places.append(f)

        if route_slugs:
            mode = "route"
        elif len(places) >= 2:
            mode = "set"
        elif len(places) == 1:
            mode = "single"
        else:
            mode = "none"

        features = list(places)
        fallback = False

        # ---- nearby: one place only, the event Nearby rule ----
        if mode == "single":
            lon, lat = places[0]["geometry"]["coordinates"]
            own = places[0]["properties"]["slug"]
            candidates = [c for c in pool if c["slug"] != own]
            chosen, _, _ = C.select(gather_from_point(lon, lat, candidates))
            if not chosen:
                # Remote place: the closest few, whatever their lane.
                fallback = True
                ranked = sorted(candidates, key=lambda c: (
                    miles_between(lon, lat, c["lon"], c["lat"]), c["name"].lower()))
                chosen = []
                for c in ranked[:NEAREST_FALLBACK]:
                    c = dict(c)
                    c["off_miles"] = round(miles_between(lon, lat, c["lon"], c["lat"]), 2)
                    chosen.append(c)
            chosen.sort(key=lambda c: (c["off_miles"], c["name"].lower()))
            features.extend(nearby_feature(c) for c in chosen)

        fc = {
            "type": "FeatureCollection",
            "properties": {"story": story, "mode": mode, "routes": route_slugs,
                           "nearbyFallback": fallback},
            "features": features,
        }
        with open(os.path.join(OUT_DIR, f"{story}.geojson"), "w") as fh:
            json.dump(fc, fh, ensure_ascii=False, indent=1)
            fh.write("\n")
        near = sum(1 for f in features if f["properties"]["kind"] == "nearby")
        written.append(f"articles/{story}.geojson  mode={mode}  places={len(places)}"
                       f"  nearby={near}{' (nearest-few fallback)' if fallback else ''}"
                       f"  routes={','.join(route_slugs) or '-'}")

    # A feed whose story was deleted or archived is removed, so a dead URL
    # never draws an old map.
    for path in glob.glob(os.path.join(OUT_DIR, "*.geojson")):
        if os.path.basename(path) not in keep:
            os.remove(path)
            written.append(f"removed {os.path.relpath(path, ROOT)} (story no longer exists)")

    print(f"{len(articles)} stor{'y' if len(articles) == 1 else 'ies'} read")
    for line in written:
        print("  " + line)
    if findings:
        print("\nFINDINGS")
        for line in findings:
            print("  - " + line)

    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as fh:
            fh.write("### Story map feeds\n\n")
            fh.write("\n".join(f"- `{w}`" for w in written) or "- no stories yet")
            if findings:
                fh.write("\n\n**Findings**\n\n" + "\n".join(f"- {x}" for x in findings))
            fh.write("\n")


if __name__ == "__main__":
    build()
