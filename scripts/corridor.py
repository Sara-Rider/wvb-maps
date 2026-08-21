#!/usr/bin/env python3
"""Corridor computation — which directory listings count as "nearby" a route.

Repo path: scripts/corridor.py
Sibling of scripts/gpx_track.py. Imported by scripts/build_route_feed.py.

WHY THIS IS COMPUTED IN THE ACTION AND NOT IN AIRTABLE
------------------------------------------------------
Airtable is the system of record for entities and relationships, but it holds
no route geometry — no track, no vertices, no way to ask "how far is this
listing from the road." The corridor is a geometry question, so it is answered
where the geometry lives: in the build, next to the GPX. Airtable and Webflow
both receive the ANSWER; neither computes it. (Decision 23, amended.)

WHAT "NEARBY" MEANS HERE
------------------------
Not crow-flies distance from the route's start. Not "same county." Distance
from the ROAD ITSELF — the perpendicular offset from the nearest point on the
track — because that is the number a rider actually pays for in miles ridden.
A listing 4 miles off the road is an 8-mile detour, and on WV back roads that
is 30-40 minutes, not 8 minutes. That reality is why the radii below are small
and why they differ by lane.

THE LANE RADII ARE NOT ONE NUMBER (locked 2026-08-19)
-----------------------------------------------------
A single radius is wrong in both directions at once: 10 miles is absurd for
fuel (you would run dry looking for it) and stingy for a motorcycle dealer
(you will ride an hour for a tire you need today). So each lane carries the
radius that matches how far a rider will actually go for that thing:

    fuel         3 mi    you need it now, or you needed it ten miles ago
    food         5 mi    worth a short detour, not a half-hour one
    attraction   5 mi    the point of the ride is the ride
    other        5 mi    unknown quantity, treat it like food
    camping     10 mi    end-of-day decision, you are already stopping
    lodging     10 mi    same
    guides      10 mi    planned in advance, not decided at speed
    moto        15 mi    a broken bike changes the math completely

CAP AND ORDER
-------------
Three per lane. A rail of forty listings is not a recommendation, it is a
phone book — and the founder's target is 1,000 listings, so the cap has to
hold at scale, not just today at 89.

The rail is ordered by ROUTE MILE, not by distance and not alphabetically.
That makes it a strip map: the things at the top are the things you reach
first. It answers "what is coming up" for a rider mid-route and "how does this
day lay out" for a rider planning one — the two uses the founder named.

CERTIFIED GETS SLOTS, NEVER A WIDER RADIUS
-------------------------------------------
Certified is an earned trust mark, so it must not drown in a sea of free
listings. But widening its radius would put a Certified business on a rail it
is genuinely too far from — buying visibility with a rider's wasted afternoon,
which is exactly the trade that would discredit the mark.

So Certified is favoured in RANKING (it sorts first inside its lane) and the
rail reserves up to three slots for it: if fewer than three Certified listings
survive the per-lane cap, the nearest Certified listings that were cut are
promoted back in, past the cap. They still have to be inside their own lane's
radius. No exceptions, no wider circle.

Featured (a paid placement) ranks after Certified and before everything else.
It never gets a reserved slot — paying moves you up a list you already qualify
for; it does not put you on a list you did not.

DETERMINISM MATTERS MORE THAN IT LOOKS
---------------------------------------
This module's output is written back to the Webflow CMS. If two runs with
identical inputs produced different orders, every run would republish six
route items forever. Every sort key therefore ends in the item name, so ties
break the same way every time.
"""

import math
from datetime import datetime, timezone

# ---- projection -------------------------------------------------------
# Equirectangular at WV's mid-latitude. Over a 150-mile loop the error against
# a great-circle distance is under a tenth of a percent, and this runs inside
# an O(candidates x vertices) loop where trig per vertex would be felt.
_LAT0 = 38.5
_MPD_LAT = 69.0
_MPD_LNG = 69.0 * math.cos(math.radians(_LAT0))

# ---- the locked parameters -------------------------------------------
LANE_RADIUS_MILES = {
    "fuel": 3.0,
    "food": 5.0,
    "attraction": 5.0,
    "other": 5.0,
    "camping": 10.0,
    "lodging": 10.0,
    "guides": 10.0,
    "moto": 15.0,
}

LANE_CAP = 3
CERTIFIED_RESERVE = 3

# The 15 canonical glyph tokens collapse into 8 rider-facing lanes. Every
# attraction subtype rides in one lane because a rider filtering a route does
# not think "show me waterfalls but not overlooks" — they think "see and do."
TOKEN_TO_LANE = {
    "fuel": "fuel",
    "food": "food",
    "camping": "camping",
    "lodging": "lodging",
    "guides": "guides",
    "moto": "moto",
    "other": "other",
    "attraction": "attraction",
    "overlook": "attraction",
    "waterfall": "attraction",
    "bridge": "attraction",
    "monument": "attraction",
    "park": "attraction",
    "scenic-road": "attraction",
    "swing": "attraction",
}

# Chip labels for the route-page filter rail. Order is rider priority, not
# alphabetical: what you need, then what you want, then where you sleep.
LANE_LABEL = {
    "fuel": "Fuel",
    "food": "Food & Drink",
    "attraction": "See & Do",
    "moto": "Moto Service",
    "lodging": "Lodging",
    "camping": "Camping",
    "guides": "Guides & Outfitters",
    "other": "Other",
}
LANE_ORDER = ["fuel", "food", "attraction", "moto", "lodging", "camping",
              "guides", "other"]

MAX_RADIUS = max(LANE_RADIUS_MILES.values())


def lane_for(token):
    return TOKEN_TO_LANE.get((token or "").strip().lower(), "other")


def is_featured(featured_until, now=None):
    """A paid placement is featured only while it is paid for.

    `featured-until` is a DateTime on the directory item. An expired date is
    treated as not featured, silently — an expired sponsorship should stop
    working on its own, without anyone remembering to clear a checkbox.
    """
    if not featured_until:
        return False
    raw = str(featured_until).strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        return False
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt > (now or datetime.now(timezone.utc))


# ---- the road as a measurable thing -----------------------------------

def _seg_dist2(px, py, ax, ay, bx, by):
    """Squared distance from a point to a segment, plus where along it."""
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    if L2 == 0.0:
        return (px - ax) ** 2 + (py - ay) ** 2, 0.0
    t = ((px - ax) * dx + (py - ay) * dy) / L2
    t = 0.0 if t < 0.0 else (1.0 if t > 1.0 else t)
    cx, cy = ax + t * dx, ay + t * dy
    return (px - cx) ** 2 + (py - cy) ** 2, t


class Corridor:
    """A route's geometry, prepared once and queried many times.

    Built from the same segment list gpx_track.parse_gpx returns, so the map
    line and the corridor are measured against the identical geometry. If they
    were built from different sources the rail could say "2 miles off route"
    about a road the drawn line never touches.
    """

    def __init__(self, segments, coarse_tolerance=0.5):
        self.pts = []          # flat [(x, y, cumulative_mile), ...]
        self.spans = []        # [(first_index, last_index), ...] per segment
        self.miles = 0.0
        cum = 0.0
        for seg in segments:
            if len(seg) < 2:
                continue
            start = len(self.pts)
            prev = None
            for lon, lat in seg:
                x, y = lon * _MPD_LNG, lat * _MPD_LAT
                if prev is not None:
                    # Distance accrues WITHIN a segment only. The gap between
                    # two segments is a gap in the recording, not road ridden,
                    # so it must not inflate the route mile — but the running
                    # total carries across, because the rail still has to be
                    # ordered end to end.
                    cum += math.hypot(x - prev[0], y - prev[1])
                self.pts.append((x, y, cum))
                prev = (x, y)
            self.spans.append((start, len(self.pts) - 1))
        self.miles = cum

        # Bounding box in raw lon/lat, for the cheap first rejection.
        if self.pts:
            xs = [p[0] for p in self.pts]
            ys = [p[1] for p in self.pts]
            self.bbox = (min(xs), min(ys), max(xs), max(ys))   # projected
        else:
            self.bbox = None

        # A decimated copy for the second rejection. Ramer-Douglas-Peucker
        # guarantees every discarded vertex sits within the tolerance of the
        # simplified line, so a point further than radius + 2*tolerance from
        # the coarse line cannot be within radius of the real one. Doubling
        # the tolerance is deliberate slack: this filter must never produce a
        # false negative, only save work.
        self._coarse_slack = 2.0 * coarse_tolerance
        self._coarse = []
        for s, e in self.spans:
            self._coarse.append(
                _simplify_xy([(self.pts[i][0], self.pts[i][1])
                              for i in range(s, e + 1)], coarse_tolerance))

    def __bool__(self):
        return bool(self.pts)

    def _coarse_dist(self, px, py):
        best = float("inf")
        for seg in self._coarse:
            for i in range(len(seg) - 1):
                ax, ay = seg[i]
                bx, by = seg[i + 1]
                d2, _ = _seg_dist2(px, py, ax, ay, bx, by)
                if d2 < best:
                    best = d2
        return math.sqrt(best) if best < float("inf") else float("inf")

    def nearest(self, lon, lat, max_miles=None):
        """(off_route_miles, route_mile) for a coordinate.

        Returns None when max_miles is given and the point is beyond it — the
        caller does not need an exact distance for something it will discard,
        and skipping the fine pass is where the run time goes at 1,000
        listings.
        """
        if not self.pts:
            return None
        px, py = lon * _MPD_LNG, lat * _MPD_LAT

        if max_miles is not None and self.bbox:
            x0, y0, x1, y1 = self.bbox
            if (px < x0 - max_miles or px > x1 + max_miles
                    or py < y0 - max_miles or py > y1 + max_miles):
                return None
            if self._coarse_dist(px, py) > max_miles + self._coarse_slack:
                return None

        best_d2, best_mile = float("inf"), 0.0
        pts = self.pts
        for s, e in self.spans:
            for i in range(s, e):
                ax, ay, am = pts[i]
                bx, by, bm = pts[i + 1]
                d2, t = _seg_dist2(px, py, ax, ay, bx, by)
                if d2 < best_d2:
                    best_d2 = d2
                    best_mile = am + t * (bm - am)
        d = math.sqrt(best_d2)
        if max_miles is not None and d > max_miles:
            return None
        return d, best_mile


def _simplify_xy(pts, tolerance):
    """RDP on already-projected points. Iterative, so a 20k-vertex track
    cannot blow the recursion limit."""
    if len(pts) < 3:
        return list(pts)
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        lo, hi = stack.pop()
        if hi <= lo + 1:
            continue
        ax, ay = pts[lo]
        bx, by = pts[hi]
        worst, idx = -1.0, -1
        for i in range(lo + 1, hi):
            d2, _ = _seg_dist2(pts[i][0], pts[i][1], ax, ay, bx, by)
            if d2 > worst:
                worst, idx = d2, i
        if worst > tolerance * tolerance:
            keep[idx] = True
            stack.append((lo, idx))
            stack.append((idx, hi))
    return [p for p, k in zip(pts, keep) if k]


# ---- selection --------------------------------------------------------

def gather(corridor, candidates):
    """Measure every candidate against the road; keep the in-radius ones.

    `candidates` are dicts carrying at least: name, lane, lon, lat.
    Each kept candidate gains off_miles and route_mile.
    """
    kept = []
    for c in candidates:
        radius = LANE_RADIUS_MILES.get(c["lane"], 5.0)
        hit = corridor.nearest(c["lon"], c["lat"], max_miles=radius)
        if hit is None:
            continue
        off, mile = hit
        out = dict(c)
        out["off_miles"] = round(off, 2)
        out["route_mile"] = round(mile, 2)
        kept.append(out)
    return kept


def _rank_key(c):
    # Certified first, then Featured, then closest to the road. Name last so
    # two equidistant listings never swap places between runs.
    return (not c.get("certified"), not c.get("featured"),
            c["off_miles"], c["name"].lower())


def select(kept, lane_cap=LANE_CAP, certified_reserve=CERTIFIED_RESERVE):
    """Apply the cap, honour the Certified reserve, order by route mile.

    Returns (chosen, promoted, dropped) so the run log can say what the cap
    actually cost — a silent cap reads as "that is everything nearby," which
    it is not.
    """
    by_lane = {}
    for c in kept:
        by_lane.setdefault(c["lane"], []).append(c)

    chosen, dropped = [], []
    for lane in sorted(by_lane):
        group = sorted(by_lane[lane], key=_rank_key)
        chosen.extend(group[:lane_cap])
        dropped.extend(group[lane_cap:])

    promoted = []
    room = certified_reserve - sum(1 for c in chosen if c.get("certified"))
    if room > 0:
        cut_certified = sorted(
            (c for c in dropped if c.get("certified")),
            key=lambda c: (c["off_miles"], c["name"].lower()))
        promoted = cut_certified[:room]
        for c in promoted:
            c["reserved"] = True
        chosen.extend(promoted)
        kept_ids = {id(c) for c in promoted}
        dropped = [c for c in dropped if id(c) not in kept_ids]

    chosen.sort(key=lambda c: (c["route_mile"], c["name"].lower()))
    return chosen, promoted, dropped
