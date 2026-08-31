#!/usr/bin/env python3
"""Per-event nearby feeds — which directory listings count as "nearby" an event.

Repo path: scripts/build_event_nearby.py
Sibling of scripts/build_route_feed.py. Run it after scripts/build_events_feed.py.

Writes:
  * events/<slug>.geojson   one file per published event
  * the `nearby-businesses` MultiReference on each Webflow event item

WHY A SECOND MODULE AND NOT A BRANCH IN build_route_feed.py
------------------------------------------------------------
A route is a line and an event is a point. Everything downstream of that one
difference is identical — same lanes, same radii, same cap, same reserve, same
ranking, same feature contract — so the difference is isolated here and
NOTHING is re-implemented. The locked parameters and the selection algorithm
are imported from corridor.py; the candidate pool and the Webflow helpers are
imported from build_route_feed.py; the event pin contract is imported from
build_events_feed.py. If a radius changes, or a field is added to a directory
candidate, this module inherits it without being touched. That is deliberate:
a second copy of the radii is a second thing to forget.

DISTANCE IS FROM THE EVENT, STRAIGHT-LINE
------------------------------------------
For a route, "nearby" is the perpendicular offset from the road, because the
rider is in motion and pays for the detour twice. For an event the rider is
stationary at a destination, so the question is simply "how far is this from
where I am standing." Same equirectangular projection as corridor.py, imported
rather than redefined so the two features can never disagree about how far a
mile is.

THE RADII ARE THE ROUTE RADII, DELIBERATELY AND PROVISIONALLY
--------------------------------------------------------------
fuel 3 / food 5 / attraction 5 / other 5 / camping 10 / lodging 10 /
guides 10 / moto 15 — inherited unchanged from corridor.LANE_RADIUS_MILES.

They were tuned for a rider in motion, and an event rider's calculus is
arguably different: you will drive twenty minutes from a poker run to a bed,
and you are not hunting fuel while parked. Founder decision 2026-08-31: ship
the same numbers, then tune from what real event pages look like rather than
guessing a second set in advance. When they do diverge, add EVENT_LANE_RADIUS
here and leave corridor.py's alone — the route numbers are load-bearing for a
different question.

A CURATED STOP IS NEVER ALSO A NEARBY LISTING
----------------------------------------------
Same rule the corridor follows. Whatever sits in the event's Related
Businesses is already pinned and already named; repeating it in Nearby makes
the rail look padded and makes "I chose this" indistinguishable from "geometry
found it." Decision 95's four tiers, applied to a point instead of a line.

WHY select() IS REUSED WITHOUT MODIFICATION
--------------------------------------------
corridor.select() ranks on off_miles and orders on route_mile. For an event
those are the same number, so this module sets both to the point distance and
calls select() unchanged. No flag, no branch, no forked copy of the cap and
reserve logic — and route behaviour cannot regress, because nothing in
corridor.py is edited.
"""

import json
import os
import sys

import requests

import corridor as C
from build_route_feed import (
    API,
    DIRECTORY_COLLECTION_ID,
    HDRS,
    all_items,
    directory_candidates,
    option_names,
    ref_ids,
    region_names,
)
from build_events_feed import (
    EVENT_TYPE_TO_TOKEN,
    EVENTS_COLLECTION_ID,
    LAT_RANGE,
    LNG_RANGE,
)

OUT_DIR = "events"          # generated, overwritten every run
NEARBY_FIELD = "nearby-businesses"
STOPS_FIELD = "related-businesses"

TOKEN = os.environ.get("WEBFLOW_API_TOKEN") or os.environ.get("WEBFLOW_TOKEN")

SKIP_CMS = os.environ.get("WVB_SKIP_CMS") == "1"
FORCE_EMPTY = os.environ.get("WVB_FORCE_EMPTY") == "1"


# ---- distance ---------------------------------------------------------

def miles_between(lon1, lat1, lon2, lat2):
    """Straight-line miles, in corridor.py's projection.

    Imported constants, not copied ones: if the projection is ever retuned,
    the route corridor and the event radius move together.
    """
    dx = (lon1 - lon2) * C._MPD_LNG
    dy = (lat1 - lat2) * C._MPD_LAT
    return (dx * dx + dy * dy) ** 0.5


def gather_from_point(lon, lat, candidates):
    """Measure every candidate against one point; keep the in-radius ones.

    Sets BOTH off_miles and route_mile to the same distance so that
    corridor.select() — which ranks on the first and orders on the second —
    behaves correctly for a point without needing to know it is one.
    """
    kept = []
    for c in candidates:
        radius = C.LANE_RADIUS_MILES.get(c["lane"], 5.0)
        d = miles_between(lon, lat, c["lon"], c["lat"])
        if d > radius:
            continue
        out = dict(c)
        out["off_miles"] = round(d, 2)
        out["route_mile"] = out["off_miles"]
        kept.append(out)
    return kept


# ---- features ---------------------------------------------------------

def event_feature(lon, lat, props):
    """The event's own pin. Same contract as its entry in events.geojson,
    plus kind, so one embed can read either file without a second parser."""
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {"kind": "event", **props},
    }


def nearby_feature(c):
    """Byte-for-byte the route contract, except that routeMile/offRouteMiles —
    which mean nothing without a line — collapse to a single `miles`."""
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
            "miles": c["off_miles"],
            "url": f"/directory/{c['slug']}",
            "website": c["website"],
            "tel": c["tel"],
            "maps": c["maps"],
        },
    }


# ---- the CMS write ----------------------------------------------------

def stored_nearby():
    """{eventItemId: [reference ids]} read from the STAGED items endpoint.

    Same reason as build_route_feed.stored_nearby(): the live response does not
    carry a MultiReference written by the API, so comparing against it makes
    "has this changed?" always answer yes and republishes every event on every
    no-op run.
    """
    out = {}
    for it in all_items(EVENTS_COLLECTION_ID, live=False):
        out[it["id"]] = ref_ids((it.get("fieldData") or {}).get(NEARBY_FIELD))
    return out


def push_nearby(event_id, is_draft, item_ids, current):
    """Write the computed rail to the event's Nearby field.

    Never raises. The feeds are already on disk by the time this runs, and a
    CMS failure must not cost them.
    """
    if SKIP_CMS:
        return "skipped", "WVB_SKIP_CMS=1"

    stored = ref_ids(current) if current else []
    if stored == item_ids:
        return "unchanged", ""

    if not stored:
        why = "stored 0 — field empty, or absent from the live response"
    elif set(stored) == set(item_ids):
        why = f"stored {len(stored)}, same set but different order"
    else:
        added = len(set(item_ids) - set(stored))
        gone = len(set(stored) - set(item_ids))
        why = f"stored {len(stored)}, +{added} -{gone}"

    if not item_ids and stored and not FORCE_EMPTY:
        return "refused", ("computed rail is empty but the stored one is not — "
                           "this is what a failed directory load looks like. "
                           "Set WVB_FORCE_EMPTY=1 if the emptying is real.")

    suffix = "" if is_draft else "/live"
    url = f"{API}/collections/{EVENTS_COLLECTION_ID}/items/{event_id}{suffix}"
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
            "Give the token CMS write scope, or set WVB_SKIP_CMS=1.")
    if not r.ok:
        return "error", f"HTTP {r.status_code} {r.text[:200]}"
    return (("written-staged" if is_draft else "written-live"),
            f"{len(item_ids)} refs ({why})")


# ---- build ------------------------------------------------------------

def build():
    if not TOKEN:
        sys.exit("WEBFLOW_API_TOKEN is not set.")

    os.makedirs(OUT_DIR, exist_ok=True)

    regions = region_names()
    directory = {it["id"]: (it.get("fieldData") or {})
                 for it in all_items(DIRECTORY_COLLECTION_ID)}
    dir_categories = option_names(DIRECTORY_COLLECTION_ID).get(
        "business-category", {})
    pool, no_coord = directory_candidates(directory, dir_categories, regions)

    ev_opts = option_names(EVENTS_COLLECTION_ID)
    type_names = ev_opts.get("event-type", {})
    status_names = ev_opts.get("listing-status", {})

    stored_rails = {} if SKIP_CMS else stored_nearby()

    written, cms_log, notes, findings = [], [], [], []
    seen_slugs = set()

    for item in all_items(EVENTS_COLLECTION_ID):
        fd = item.get("fieldData") or {}
        slug = (fd.get("slug") or "").strip()
        name = (fd.get("name") or "").strip()
        if not slug:
            findings.append(f"{name or item['id']}: no slug, skipped")
            continue
        seen_slugs.add(slug)

        try:
            lat = float(str(fd.get("latitude")).strip())
            lng = float(str(fd.get("longitude")).strip())
        except (TypeError, ValueError):
            notes.append(f"{slug}: no coordinate — no feed, no rail. "
                         "An event without a location cannot have a nearby.")
            continue

        if not (LAT_RANGE[0] <= lat <= LAT_RANGE[1]
                and LNG_RANGE[0] <= lng <= LNG_RANGE[1]):
            findings.append(f"{slug}: {lat}, {lng} outside the validation box")
            continue

        label = type_names.get(fd.get("event-type"), "")
        token = EVENT_TYPE_TO_TOKEN.get(label)
        if token is None:
            token = "other"
            findings.append(f"{slug}: Event Type {label!r} has no glyph token "
                            "— add it to EVENT_TYPE_TO_TOKEN.")

        # A curated stop is never also a nearby listing.
        stop_ids = set(ref_ids(fd.get(STOPS_FIELD)))
        candidates = [c for c in pool if c["id"] not in stop_ids]

        kept = gather_from_point(lng, lat, candidates)
        chosen, promoted, dropped = C.select(kept)

        features = [event_feature(lng, lat, {
            "slug": slug,
            "name": name,
            "type": token,
            "typeLabel": label,
            "region": regions.get(fd.get("travel-region"), ""),
            "date": fd.get("event-date"),
            "endDate": fd.get("end-date"),
            "locationName": (fd.get("location-name") or "").strip(),
            "status": status_names.get(fd.get("listing-status"), ""),
            "url": f"/events/{slug}",
            "link": fd.get("link"),
            "maps": ("https://www.google.com/maps/dir/?api=1&destination="
                     f"{lat},{lng}"),
        })]
        features.extend(nearby_feature(c) for c in chosen)

        out_path = os.path.join(OUT_DIR, f"{slug}.geojson")
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump({"type": "FeatureCollection", "features": features},
                      fh, ensure_ascii=False, indent=1)
            fh.write("\n")
        written.append(f"{out_path}  {len(chosen)} nearby "
                       f"(of {len(kept)} in range, {len(dropped)} cut"
                       + (f", {len(promoted)} certified promoted" if promoted
                          else "") + ")")

        if not kept:
            notes.append(f"{slug}: nothing within any lane radius. Expected "
                         "where the directory is still thin, not a failure.")

        status, detail = push_nearby(
            item["id"], bool(item.get("isDraft")),
            [c["id"] for c in chosen], stored_rails.get(item["id"]))
        cms_log.append(f"{slug}: {status}" + (f" — {detail}" if detail else ""))

    # Feeds for events that no longer exist are dead weight the map can still
    # fetch. Name them; deleting a file is a decision, not a side effect.
    stale = sorted(f[:-len(".geojson")] for f in os.listdir(OUT_DIR)
                   if f.endswith(".geojson")
                   and f[:-len(".geojson")] not in seen_slugs)

    # ---- report -------------------------------------------------------
    print(f"{len(written)} event feed(s) written:")
    for w in written:
        print("  " + w)
    print(f"candidate pool: {len(pool)} published listings with coordinates")
    if no_coord:
        print(f"  {len(no_coord)} listing(s) skipped for no coordinate: "
              + ", ".join(no_coord[:10])
              + (" ..." if len(no_coord) > 10 else ""))
    print("Nearby (CMS):")
    for c in cms_log:
        print("  " + c)
    if stale:
        print(f"  NOTE {len(stale)} feed file(s) with no matching published "
              "event — delete by hand if the event is really gone: "
              + ", ".join(stale))
    for n in notes:
        print("  NOTE " + n)
    for f in findings:
        print("  FAIL " + f)
    if not findings:
        print("  ok no hard findings")


if __name__ == "__main__":
    build()
