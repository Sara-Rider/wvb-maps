#!/usr/bin/env python3
"""GPX -> route track geometry, plus line simplification.

WHY THIS EXISTS
---------------
Every route already produces one GPX, because riders download it. Requiring a
separate hand-converted tracks/<slug>.geojson meant one Furkot export had to
become two artifacts, by hand, consistently, forever. This module lets the
build read the GPX directly, so the founder commits the same file she uploads
to Drive for riders and nothing else.

WHAT IT NEEDS FROM THE EXPORT
-----------------------------
Track points: <trk><trkseg><trkpt lat lon>. In Furkot that is the "detailed
track" option. Without it the GPX carries only <rtept> or <wpt> — turn
instructions and stop markers, not road geometry — and there is no line to
draw. This module reads trkpt first and falls back to rtept, but a route built
from rtept alone will look like a series of straight hops between turns, not a
road. The parser reports which source it used so a bad export is visible.

No external dependencies. xml.etree handles GPX fine, and GPX namespaces vary
between exporters, so tags are matched on local name only.
"""

import math
import xml.etree.ElementTree as ET


def _local(tag):
    """Strip the XML namespace: '{http://...}trkpt' -> 'trkpt'."""
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def parse_gpx(path):
    """Return (segments, source, meta).

    segments: list of coordinate lists, each [[lon, lat], ...] in GeoJSON order
    source:   'trkpt' | 'rtept' | None
    meta:     {'creator':…, 'name':…, 'trkpt':N, 'rtept':N, 'wpt':N}
    """
    root = ET.parse(path).getroot()

    counts = {"trkpt": 0, "rtept": 0, "wpt": 0}
    for el in root.iter():
        name = _local(el.tag)
        if name in counts:
            counts[name] += 1

    first_name = ""
    for el in root.iter():
        if _local(el.tag) == "name" and (el.text or "").strip():
            first_name = el.text.strip()
            break

    meta = {
        "creator": root.get("creator") or "",
        "name": first_name,
        **counts,
    }

    def pts(el, want):
        out = []
        for p in el.iter():
            if _local(p.tag) != want:
                continue
            try:
                # GeoJSON is [longitude, latitude] — the standing footgun.
                out.append([float(p.get("lon")), float(p.get("lat"))])
            except (TypeError, ValueError):
                continue
        return out

    # Prefer real track segments, one line per <trkseg>.
    segments = []
    for trk in root.iter():
        if _local(trk.tag) != "trk":
            continue
        for seg in trk.iter():
            if _local(seg.tag) != "trkseg":
                continue
            c = pts(seg, "trkpt")
            if len(c) >= 2:
                segments.append(c)
    if segments:
        return segments, "trkpt", meta

    # Some exporters put trkpt directly under <trk> with no <trkseg>.
    for trk in root.iter():
        if _local(trk.tag) != "trk":
            continue
        c = pts(trk, "trkpt")
        if len(c) >= 2:
            segments.append(c)
    if segments:
        return segments, "trkpt", meta

    # Fall back to the route element. Legal GPX, but these are turn points,
    # not road geometry — the line will cut corners.
    for rte in root.iter():
        if _local(rte.tag) != "rte":
            continue
        c = pts(rte, "rtept")
        if len(c) >= 2:
            segments.append(c)
    if segments:
        return segments, "rtept", meta

    return [], None, meta


# ---- simplification ---------------------------------------------------
# Ramer-Douglas-Peucker. Used ONLY for the all-routes index feed: six full
# tracks would be most of a megabyte, and at state zoom a 2,089-point line and
# a 150-point line are the same picture. Route pages get full fidelity.

_LAT0 = 38.5
_MPD_LAT = 69.0
_MPD_LNG = 69.0 * math.cos(math.radians(_LAT0))


def _xy(c):
    return (c[0] * _MPD_LNG, c[1] * _MPD_LAT)


def _perp(p, a, b):
    px, py = _xy(p); ax, ay = _xy(a); bx, by = _xy(b)
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    if not L2:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def simplify(coords, tolerance_miles=0.15):
    """RDP on a coordinate list. Iterative, so a 20k-point track cannot
    blow the recursion limit."""
    if len(coords) < 3:
        return list(coords)
    keep = [False] * len(coords)
    keep[0] = keep[-1] = True
    stack = [(0, len(coords) - 1)]
    while stack:
        lo, hi = stack.pop()
        if hi <= lo + 1:
            continue
        worst, idx = -1.0, -1
        for i in range(lo + 1, hi):
            d = _perp(coords[i], coords[lo], coords[hi])
            if d > worst:
                worst, idx = d, i
        if worst > tolerance_miles:
            keep[idx] = True
            stack.append((lo, idx))
            stack.append((idx, hi))
    return [c for c, k in zip(coords, keep) if k]


if __name__ == "__main__":
    import sys
    for p in sys.argv[1:]:
        segs, src, meta = parse_gpx(p)
        total = sum(len(s) for s in segs)
        simp = sum(len(simplify(s)) for s in segs)
        print(f"{p}")
        print(f"  creator : {meta['creator'] or '(none)'}")
        print(f"  name    : {meta['name'] or '(none)'}")
        print(f"  counts  : trkpt={meta['trkpt']} rtept={meta['rtept']} wpt={meta['wpt']}")
        print(f"  source  : {src or 'NONE — no drawable geometry'}")
        print(f"  segments: {len(segs)}  points: {total}  simplified: {simp}")
        if src == "rtept":
            print("  WARNING : built from route points, not a track. The line will "
                  "cut corners. Re-export from Furkot with the detailed track "
                  "option enabled.")
